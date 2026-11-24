import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, exceptions, stockEvents } from "@/db/schema";
import { UNKNOWN_BARCODE } from "@/lib/demo-labels";
import {
  listExceptions,
  NOT_ON_CONTRACT_ACTION,
  UNMAPPED_ACTION,
} from "@/lib/exceptions";
import {
  CARDIVA_VASCADE,
  DECA_CABLE_PACK,
  NUVISION_NAV,
  TERUMO_11FR,
  TERUMO_8FR,
  gs1LotLabel,
  gtinLabel,
  hibcPrimaryLabel,
  hibcSecondaryLabel,
} from "@/lib/real-products";
import { listPullableLots, stockOnHand } from "@/lib/stock";
import {
  applyStationScan,
  closeStationCase,
  isPastExpiry,
  openStationCase,
} from "@/lib/station";
import { CARDIVA_HIBC_SAMPLE, TERUMO_GS1_SAMPLE } from "@/lib/barcode";

const ALEX = 1;
const TERRY = 5;
const PAT = 6;
const NICO = 7;

const EXPIRED_TERUMO =
  "(01)00389701007496(17)200101(10)DEMO-EXPIRED-ARRIVE";

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

  it("vendors arrive, techs use and return; KU pays at use", async () => {
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

    const techArrive = await applyStationScan(
      { mode: "arrive", rawBarcode: TERUMO_GS1_SAMPLE },
      ALEX,
      db,
    );
    expect(techArrive.status).toBe("error");
    if (techArrive.status === "error") expect(techArrive.code).toBe("role");

    const sheathBefore = await onHand(TERUMO_8FR.id, TERUMO_8FR.lot);
    const arrived = await applyStationScan(
      { mode: "arrive", rawBarcode: TERUMO_GS1_SAMPLE },
      TERRY,
      db,
    );
    expect(arrived.status).toBe("success");
    if (arrived.status === "success") {
      expect(arrived.headline).toBe("Added to shelf");
      expect(arrived.item.lot).toBe(TERUMO_8FR.lot);
    }
    expect(await onHand(TERUMO_8FR.id, TERUMO_8FR.lot)).toBe(sheathBefore + 1);

    const expired = await applyStationScan(
      { mode: "arrive", rawBarcode: EXPIRED_TERUMO },
      TERRY,
      db,
    );
    expect(expired.status).toBe("error");
    if (expired.status === "error") expect(expired.code).toBe("expired");

    const eventsBeforeUnknown = await db.select().from(stockEvents);
    const unknown = await applyStationScan(
      { mode: "arrive", rawBarcode: UNKNOWN_BARCODE },
      TERRY,
      db,
    );
    expect(unknown.status).toBe("unknown");
    expect((await db.select().from(stockEvents)).length).toBe(
      eventsBeforeUnknown.length,
    );

    const wrongVendor = await applyStationScan(
      { mode: "arrive", rawBarcode: CARDIVA_HIBC_SAMPLE },
      TERRY,
      db,
    );
    expect(wrongVendor.status).toBe("error");
    if (wrongVendor.status === "error") expect(wrongVendor.code).toBe("wrong_vendor");
    expect(
      (await listExceptions({ type: "rejected_arrival", vendorId: 1 }, db)).length,
    ).toBeGreaterThan(0);

    const extraZero = await applyStationScan(
      { mode: "arrive", rawBarcode: "+M729800612C00" },
      PAT,
      db,
    );
    expect(extraZero.status).toBe("needs_lot");
    if (extraZero.status === "needs_lot") {
      expect(extraZero.product.catalogNumber).toBe("800-612C");
    }

    const usedWithoutCase = await applyStationScan(
      { mode: "use", rawBarcode: TERUMO_GS1_SAMPLE },
      ALEX,
      db,
    );
    expect(usedWithoutCase.status).toBe("error");
    if (usedWithoutCase.status === "error") {
      expect(usedWithoutCase.code).toBe("no_case");
    }

    const ep = await openStationCase(ALEX, db);
    const notUsed = await applyStationScan(
      { mode: "return", rawBarcode: gtinLabel(NUVISION_NAV), caseId: ep.id },
      ALEX,
      db,
    );
    expect(notUsed.status).toBe("error");
    if (notUsed.status === "error") expect(notUsed.code).toBe("not_pulled");

    const useSheath = await applyStationScan(
      { mode: "use", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
      ALEX,
      db,
    );
    expect(useSheath.status).toBe("success");
    if (useSheath.status === "success") {
      expect(useSheath.headline).toBe("KU pays now");
    }

    const broughtBack = await applyStationScan(
      { mode: "return", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
      ALEX,
      db,
    );
    expect(broughtBack.status).toBe("success");

    const duplicate = await applyStationScan(
      { mode: "return", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
      ALEX,
      db,
    );
    expect(duplicate.status).toBe("error");
    if (duplicate.status === "error") expect(duplicate.code).toBe("duplicate");

    const allBack = await closeStationCase(ep.id, ALEX, db);
    expect(allBack).toMatchObject({ taken: 1, returned: 1, used: 0 });
  });

  it("unknown arrive opens one unmapped exception and writes no stock event", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const eventsBefore = (await db.select().from(stockEvents)).length;
    for (let i = 0; i < 2; i++) {
      const outcome = await applyStationScan(
        { mode: "arrive", rawBarcode: UNKNOWN_BARCODE },
        TERRY,
        db,
      );
      expect(outcome.status).toBe("unknown");
    }
    expect((await db.select().from(stockEvents)).length).toBe(eventsBefore);
    const open = (await listExceptions({ type: "bill_only_unmapped", status: "open", vendorId: 1 }, db)).filter(
      (row) => row.barcode === UNKNOWN_BARCODE,
    );
    expect(open).toHaveLength(1);
    const created1 = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, "exceptions"),
          eq(auditLog.entityId, open[0]!.id),
          eq(auditLog.action, UNMAPPED_ACTION),
        ),
      );
    expect(created1).toHaveLength(1);
    expect(created1[0]?.detail).toMatch(/vendor=1/);
  });

  it("HIBC use offers on-hand lots, earliest expiry first", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    await applyStationScan(
      { mode: "arrive", rawBarcode: CARDIVA_HIBC_SAMPLE, lot: "LATERLOT", expiry: "2035-01-01" },
      PAT,
      db,
    );
    await applyStationScan(
      { mode: "arrive", rawBarcode: CARDIVA_HIBC_SAMPLE, lot: "SOONERLOT", expiry: "2029-01-01" },
      PAT,
      db,
    );

    const ep = await openStationCase(ALEX, db);
    const ask = await applyStationScan(
      { mode: "use", rawBarcode: CARDIVA_HIBC_SAMPLE, caseId: ep.id },
      ALEX,
      db,
    );
    expect(ask.status).toBe("needs_lot");
    if (ask.status !== "needs_lot") return;

    const today = new Date().toISOString().slice(0, 10);
    const expiries = ask.lots.map((lot) => lot.expiry);
    expect(expiries).toEqual([...expiries].sort());
    expect(ask.lots.every((lot) => lot.onHand > 0 && lot.expiry >= today)).toBe(true);
    expect(ask.lots.map((lot) => lot.lot)).toEqual(
      expect.arrayContaining(["LATERLOT", "SOONERLOT"]),
    );

    const first = ask.lots[0]!;
    const used = await applyStationScan(
      {
        mode: "use",
        rawBarcode: CARDIVA_HIBC_SAMPLE,
        caseId: ep.id,
        lot: first.lot,
        expiry: first.expiry,
      },
      ALEX,
      db,
    );
    expect(used.status).toBe("success");

    const lots = await listPullableLots(CARDIVA_VASCADE.id, new Date(), db);
    const left = lots.find((lot) => lot.lot === first.lot)?.onHand ?? 0;
    expect(left).toBe(first.onHand - 1);
  });

  it("pairs each real item barcode with the lot-and-expiry barcode scanned after it", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const onHand = async (productId: number, lot: string) =>
      (await stockOnHand({ productId }, db)).find((row) => row.lot === lot)?.onHand ?? 0;

    const pairs = [
      { product: TERUMO_8FR, item: gtinLabel(TERUMO_8FR), lot: gs1LotLabel(TERUMO_8FR), userId: TERRY },
      { product: TERUMO_11FR, item: gtinLabel(TERUMO_11FR), lot: gs1LotLabel(TERUMO_11FR), userId: TERRY },
      { product: NUVISION_NAV, item: gtinLabel(NUVISION_NAV), lot: gs1LotLabel(NUVISION_NAV), userId: NICO },
      {
        product: CARDIVA_VASCADE,
        item: hibcPrimaryLabel(CARDIVA_VASCADE),
        lot: hibcSecondaryLabel(CARDIVA_VASCADE),
        userId: PAT,
      },
    ];
    for (const { product, item, lot, userId } of pairs) {
      const before = await onHand(product.id, product.lot);
      const first = await applyStationScan({ mode: "arrive", rawBarcode: item }, userId, db);
      expect(first.status).toBe("needs_lot");
      if (first.status !== "needs_lot") continue;

      const second = await applyStationScan(
        { mode: "arrive", rawBarcode: lot, pendingRaw: first.raw },
        userId,
        db,
      );
      expect(second.status).toBe("success");
      if (second.status !== "success") continue;
      expect(second.item.lot).toBe(product.lot);
      expect(await onHand(product.id, product.lot)).toBe(before + 1);
    }

    const ep = await openStationCase(ALEX, db);
    const ask = await applyStationScan(
      { mode: "use", rawBarcode: gtinLabel(TERUMO_11FR), caseId: ep.id },
      ALEX,
      db,
    );
    expect(ask.status).toBe("needs_lot");
    if (ask.status !== "needs_lot") return;
    const used = await applyStationScan(
      {
        mode: "use",
        rawBarcode: gs1LotLabel(TERUMO_11FR),
        caseId: ep.id,
        pendingRaw: ask.raw,
      },
      ALEX,
      db,
    );
    expect(used.status).toBe("success");
  });

  it("using the hospital-owned DECA pack opens one not_on_any_contract exception", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const openFor = async () =>
      (await listExceptions({ type: "not_on_any_contract", status: "open" }, db)).filter(
        (row) => row.productId === DECA_CABLE_PACK.id,
      );
    expect(await openFor()).toHaveLength(0);

    const vendorArrive = await applyStationScan(
      {
        mode: "arrive",
        rawBarcode: DECA_CABLE_PACK.catalogNumber,
        lot: "SPD-TEST-2",
        expiry: "2027-06-01",
      },
      TERRY,
      db,
    );
    expect(vendorArrive.status).toBe("error");
    if (vendorArrive.status === "error") expect(vendorArrive.code).toBe("wrong_vendor");
    expect(await openFor()).toHaveLength(0);

    const ep = await openStationCase(ALEX, db);
    const used = await applyStationScan(
      {
        mode: "use",
        rawBarcode: DECA_CABLE_PACK.catalogNumber,
        caseId: ep.id,
        lot: DECA_CABLE_PACK.lot,
        expiry: DECA_CABLE_PACK.expiry,
      },
      ALEX,
      db,
    );
    expect(used.status).toBe("success");
    if (used.status === "success") {
      expect(used.notice).toMatch(/not on any contract/i);
    }

    const open = await openFor();
    expect(open).toHaveLength(1);
    const audited = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, "exceptions"),
          eq(auditLog.entityId, open[0]!.id),
          eq(auditLog.action, NOT_ON_CONTRACT_ACTION),
        ),
      );
    expect(audited).toHaveLength(1);
  });
});
