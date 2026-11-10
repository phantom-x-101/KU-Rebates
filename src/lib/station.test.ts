import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exceptions } from "@/db/schema";
import {
  ABLATION_GS1_SAMPLE,
  EXPIRED_GS1_SAMPLE,
  UNKNOWN_BARCODE,
} from "@/lib/demo-labels";
import { stockOnHand } from "@/lib/stock";
import {
  applyStationScan,
  closeStationCase,
  isPastExpiry,
  openStationCase,
} from "@/lib/station";
import { CARDIVA_HIBC_SAMPLE, TERUMO_GS1_SAMPLE } from "@/lib/barcode";

describe("expiry helper", () => {
  it("treats a past ISO date as expired", () => {
    const today = new Date("2026-11-10T15:00:00Z");
    expect(isPastExpiry("2020-01-01", today)).toBe(true);
    expect(isPastExpiry("2026-11-10", today)).toBe(false);
    expect(isPastExpiry("2028-11-01", today)).toBe(false);
  });
});

describe("scan station", () => {
  let dbPath: string;
  let prevPath: string | undefined;
  let sqlite: { close: () => void } | null = null;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-station-${Date.now()}-${Math.random()}.sqlite`);
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

  it("arrives, pulls, uses, returns, wastes, and flags a gap", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const onHand = async (productId: number, lot: string) => {
      const rows = await stockOnHand({ productId }, db);
      return rows.find((row) => row.lot === lot)?.onHand ?? 0;
    };

    const sheathBefore = await onHand(1, "0001681425");
    const arrived = await applyStationScan(
      { mode: "arrive", rawBarcode: TERUMO_GS1_SAMPLE },
      1,
      db,
    );
    expect(arrived.status).toBe("success");
    if (arrived.status === "success") {
      expect(arrived.headline).toBe("Added to shelf");
      expect(arrived.item.lot).toBe("0001681425");
    }
    expect(await onHand(1, "0001681425")).toBe(sheathBefore + 1);

    const expired = await applyStationScan(
      { mode: "arrive", rawBarcode: EXPIRED_GS1_SAMPLE },
      1,
      db,
    );
    expect(expired.status).toBe("error");
    if (expired.status === "error") expect(expired.code).toBe("expired");
    expect(await onHand(1, "EXPIREDDEMO")).toBe(0);

    const unknown = await applyStationScan(
      { mode: "arrive", rawBarcode: UNKNOWN_BARCODE },
      1,
      db,
    );
    expect(unknown.status).toBe("unknown");

    const hibc = await applyStationScan(
      { mode: "arrive", rawBarcode: CARDIVA_HIBC_SAMPLE },
      1,
      db,
    );
    expect(hibc.status).toBe("needs_lot");

    const pulledWithoutCase = await applyStationScan(
      { mode: "pull", rawBarcode: TERUMO_GS1_SAMPLE },
      1,
      db,
    );
    expect(pulledWithoutCase.status).toBe("error");
    if (pulledWithoutCase.status === "error") {
      expect(pulledWithoutCase.code).toBe("no_case");
    }

    const ep = await openStationCase(1, db);
    const notPulled = await applyStationScan(
      { mode: "use", rawBarcode: ABLATION_GS1_SAMPLE, caseId: ep.id },
      1,
      db,
    );
    expect(notPulled.status).toBe("error");
    if (notPulled.status === "error") expect(notPulled.code).toBe("not_pulled");

    const pullSheath = await applyStationScan(
      { mode: "pull", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
      1,
      db,
    );
    expect(pullSheath.status).toBe("success");
    const pullAblation = await applyStationScan(
      { mode: "pull", rawBarcode: ABLATION_GS1_SAMPLE, caseId: ep.id },
      1,
      db,
    );
    expect(pullAblation.status).toBe("success");

    const used = await applyStationScan(
      { mode: "use", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
      1,
      db,
    );
    expect(used.status).toBe("success");
    if (used.status === "success") expect(used.headline).toBe("Marked used");

    const duplicate = await applyStationScan(
      { mode: "use", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
      1,
      db,
    );
    expect(duplicate.status).toBe("error");
    if (duplicate.status === "error") expect(duplicate.code).toBe("duplicate");

    const returned = await applyStationScan(
      { mode: "return", rawBarcode: ABLATION_GS1_SAMPLE, caseId: ep.id },
      1,
      db,
    );
    expect(returned.status).toBe("success");
    if (returned.status === "success") {
      expect(returned.headline).toBe("Returned to shelf");
    }

    const balanced = await closeStationCase(ep.id, 1, db);
    expect(balanced.taken).toBe(2);
    expect(balanced.used).toBe(1);
    expect(balanced.returned).toBe(1);
    expect(balanced.balanced).toBe(true);

    const gapCase = await openStationCase(1, db);
    const pullMap = await applyStationScan(
      { mode: "pull", rawBarcode: "(01)00012345670002(17)270815(10)VCMAP2001", caseId: gapCase.id },
      1,
      db,
    );
    expect(pullMap.status).toBe("success");
    const wasted = await applyStationScan(
      {
        mode: "waste",
        rawBarcode: "(01)00012345670002(17)270815(10)VCMAP2001",
        caseId: gapCase.id,
      },
      1,
      db,
    );
    expect(wasted.status).toBe("success");

    const wastedRows = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "opened_or_wasted"),
          eq(exceptions.productId, 4),
          eq(exceptions.status, "open"),
        ),
      );
    expect(wastedRows.length).toBeGreaterThanOrEqual(1);

    const leftOut = await openStationCase(1, db);
    const pullLeft = await applyStationScan(
      { mode: "pull", rawBarcode: TERUMO_GS1_SAMPLE, caseId: leftOut.id },
      1,
      db,
    );
    expect(pullLeft.status).toBe("success");
    const gap = await closeStationCase(leftOut.id, 1, db);
    expect(gap.balanced).toBe(false);
    expect(gap.gap).toBe(1);

    const gapRows = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 1),
          eq(exceptions.status, "open"),
        ),
      );
    expect(gapRows.length).toBeGreaterThanOrEqual(2);
  });
});
