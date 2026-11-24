import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, exceptions } from "@/db/schema";
import { gtinLabel, TERUMO_8FR } from "@/lib/real-products";
import { listVendorUsage } from "@/lib/vendor-portal";
import { stockOnHand } from "@/lib/stock";
import { EXAMPLE_TAG_IDS } from "@/lib/tag";
import {
  applyTagScan,
  checkInUnit,
  findUnitByTag,
  identifyCheckInProduct,
  listVendorUnits,
} from "@/lib/units";

const ALEX = 1;
const TERRY = 5;
const PAT = 6;
const TERUMO = 1;
const CARDIVA = 2;

describe("tagged check-in and check-out", () => {
  let dbPath: string;
  let prevPath: string | undefined;
  let sqlite: { close: () => void } | null = null;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-units-${Date.now()}-${Math.random()}.sqlite`);
    prevPath = process.env.KU_DB_PATH;
    process.env.KU_DB_PATH = dbPath;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    execSync("npx tsx db/seed.ts", {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, KU_DB_PATH: dbPath },
      stdio: "pipe",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    if (prevPath === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prevPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  async function db() {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;
    return created.db;
  }

  it("Terry checks in own product; Pat cannot see or check it in", async () => {
    const conn = await db();
    const identified = await identifyCheckInProduct(
      { raw: gtinLabel(TERUMO_8FR), lot: TERUMO_8FR.lot, expiry: TERUMO_8FR.expiry },
      TERRY,
      conn,
    );
    expect(identified.status).toBe("ready");

    const linked = await checkInUnit(
      {
        tagRaw: "E200-0000-0001",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    expect(linked.ok).toBe(true);
    if (linked.ok) {
      expect(linked.unit.tagDisplay).toBe("E200-0000-0001");
      expect(linked.unit.status).toBe("in_stock");
    }

    const duplicate = await checkInUnit(
      {
        tagRaw: "E20000000001",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("tag_in_use");

    const stolen = await checkInUnit(
      {
        tagRaw: "E200-0000-0002",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      PAT,
      conn,
    );
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.code).toBe("wrong_vendor");

    const terumoUnits = await listVendorUnits(TERUMO, conn);
    expect(terumoUnits).toHaveLength(1);
    expect(terumoUnits.every((row) => row.vendorId === TERUMO)).toBe(true);

    const cardivaUnits = await listVendorUnits(CARDIVA, conn);
    expect(cardivaUnits).toHaveLength(0);
    expect(cardivaUnits.some((row) => row.tagEpc === "E20000000001")).toBe(false);

    const audits = await conn.select().from(auditLog);
    expect(audits.some((row) => row.action === "check_in" && row.entity === "units")).toBe(
      true,
    );
  });

  it("Alex checks a tag out (KU pays) and a second scan returns and nets usage", async () => {
    const conn = await db();
    await checkInUnit(
      {
        tagRaw: "E200-0000-0001",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    const { openStationCase } = await import("@/lib/station");
    const ep = await openStationCase(ALEX, conn);

    const used = await applyTagScan(
      { tagRaw: "E200-0000-0001", caseId: ep.id },
      ALEX,
      conn,
    );
    expect(used.ok).toBe(true);
    if (used.ok) {
      expect(used.action).toBe("checked_out");
      expect(used.unit.status).toBe("checked_out");
      expect(used.unit.caseId).toBe(ep.id);
    }

    const usageAfterUse = await listVendorUsage(TERUMO, {}, conn);
    const taggedUse = usageAfterUse.filter((row) => row.caseId === ep.id);
    expect(taggedUse.reduce((sum, row) => sum + row.qty, 0)).toBeGreaterThanOrEqual(1);

    const broughtBack = await applyTagScan(
      { tagRaw: "e200-0000-0001", caseId: ep.id },
      ALEX,
      conn,
    );
    expect(broughtBack.ok).toBe(true);
    if (broughtBack.ok) {
      expect(broughtBack.action).toBe("returned");
      expect(broughtBack.unit.status).toBe("in_stock");
    }

    const usageAfterReturn = await listVendorUsage(TERUMO, {}, conn);
    expect(usageAfterReturn.some((row) => row.caseId === ep.id)).toBe(false);
  });

  it("unknown tag opens an exception; expired unit blocks checkout", async () => {
    const conn = await db();
    const { openStationCase } = await import("@/lib/station");
    const ep = await openStationCase(ALEX, conn);

    const unknown = await applyTagScan(
      { tagRaw: "E200-0000-0012", caseId: ep.id },
      ALEX,
      conn,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("unknown_tag");
    const tags = await conn.select().from(exceptions);
    expect(tags.some((row) => row.type === "unknown_tag")).toBe(true);

    await checkInUnit(
      {
        tagRaw: "E200-0000-0004",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    const { units } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await conn
      .update(units)
      .set({ expiry: "2020-01-01" })
      .where(eq(units.tagEpc, "E20000000004"));

    const blocked = await applyTagScan(
      { tagRaw: "E200-0000-0004", caseId: ep.id },
      ALEX,
      conn,
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("expired");
    expect(
      (await conn.select().from(exceptions)).some((row) => row.type === "expired_unit"),
    ).toBe(true);
  });

  it("tagged lot on-hand is the in-stock unit count", async () => {
    const conn = await db();
    await checkInUnit(
      {
        tagRaw: "E200-0000-0001",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    await checkInUnit(
      {
        tagRaw: "E200-0000-0002",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    const rows = await stockOnHand({ productId: TERUMO_8FR.id }, conn);
    const taggedLot = rows.find((row) => row.lot === TERUMO_8FR.lot);
    expect(taggedLot?.onHand).toBe(2);
  });

  it("check-in then check-out accept the four example RFID IDs", async () => {
    const conn = await db();
    const { openStationCase } = await import("@/lib/station");
    const ep = await openStationCase(ALEX, conn);
    const ids = [...EXAMPLE_TAG_IDS];

    const empty = await checkInUnit(
      {
        tagRaw: "   ",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.message).toBe("Tag ID is empty.");

    const short = await checkInUnit(
      {
        tagRaw: "AB12",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.message).toBe("Tag ID is too short.");

    for (const tagRaw of ids) {
      const linked = await checkInUnit(
        {
          tagRaw,
          productId: TERUMO_8FR.id,
          lot: TERUMO_8FR.lot,
          expiry: TERUMO_8FR.expiry,
        },
        TERRY,
        conn,
      );
      if (tagRaw === "E20000000001") {
        expect(linked.ok).toBe(false);
        if (!linked.ok) expect(linked.code).toBe("tag_in_use");
        continue;
      }
      expect(linked.ok).toBe(true);
      if (linked.ok) {
        const found = await findUnitByTag(tagRaw, conn);
        expect(found?.id).toBe(linked.unit.id);
        const used = await applyTagScan({ tagRaw, caseId: ep.id }, ALEX, conn);
        expect(used.ok).toBe(true);
        if (used.ok) expect(used.action).toBe("checked_out");
      }
    }

    const again = await checkInUnit(
      {
        tagRaw: "E28011700000020A5F3C9D41",
        productId: TERUMO_8FR.id,
        lot: TERUMO_8FR.lot,
        expiry: TERUMO_8FR.expiry,
      },
      TERRY,
      conn,
    );
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.code).toBe("tag_in_use");
      expect(again.message).toMatch(/already linked/i);
    }
  });
});
