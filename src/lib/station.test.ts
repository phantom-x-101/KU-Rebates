import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, exceptions } from "@/db/schema";
import {
  ABLATION_GS1_SAMPLE,
  EXPIRED_GS1_SAMPLE,
  UNKNOWN_BARCODE,
} from "@/lib/demo-labels";
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
  addStationProduct,
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

  it("arrives, pulls, returns; anything not returned counts as used", async () => {
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
    expect(await onHand(4, "EXPIREDDEMO")).toBe(0);

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

    const extraZero = await applyStationScan(
      { mode: "arrive", rawBarcode: "+M729800612C00" },
      1,
      db,
    );
    expect(extraZero.status).toBe("needs_lot");
    if (extraZero.status === "needs_lot") {
      expect(extraZero.product.catalogNumber).toBe("800-612C");
      expect(extraZero.reads.join(" ")).toMatch(/trailing 0 is not a valid check character/);
    }

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
      { mode: "return", rawBarcode: ABLATION_GS1_SAMPLE, caseId: ep.id },
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

    const broughtBack = await applyStationScan(
      { mode: "return", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
      1,
      db,
    );
    expect(broughtBack.status).toBe("success");
    if (broughtBack.status === "success") {
      expect(broughtBack.headline).toBe("Returned to shelf");
    }

    const duplicate = await applyStationScan(
      { mode: "return", rawBarcode: TERUMO_GS1_SAMPLE, caseId: ep.id },
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

    const allBack = await closeStationCase(ep.id, 1, db);
    expect(allBack).toMatchObject({ taken: 2, returned: 2, used: 0 });

    const leftOut = await openStationCase(1, db);
    const pullLeft = await applyStationScan(
      { mode: "pull", rawBarcode: TERUMO_GS1_SAMPLE, caseId: leftOut.id },
      1,
      db,
    );
    expect(pullLeft.status).toBe("success");
    const excBefore = (await db.select().from(exceptions)).length;
    const notReturned = await closeStationCase(leftOut.id, 1, db);
    expect(notReturned).toMatchObject({ taken: 1, returned: 0, used: 1 });
    expect((await db.select().from(exceptions)).length).toBe(excBefore);
  });

  it("unknown barcode opens one unmapped exception; adding the product resolves it", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const unmappedFor = async (status: string) =>
      (await listExceptions({ type: "bill_only_unmapped", status }, db)).filter(
        (row) => row.barcode === UNKNOWN_BARCODE,
      );

    for (let i = 0; i < 2; i++) {
      const outcome = await applyStationScan(
        { mode: "arrive", rawBarcode: UNKNOWN_BARCODE },
        1,
        db,
      );
      expect(outcome.status).toBe("unknown");
    }
    const open = await unmappedFor("open");
    expect(open).toHaveLength(1);
    expect(open[0]?.sourceContainer).toBe(1);
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

    const added = await addStationProduct(
      {
        vendorId: 1,
        description: "Placeholder test item",
        catalogNumber: "TEST-UNMAPPED-1",
        parLevel: 1,
        rawBarcode: UNKNOWN_BARCODE,
        mode: "arrive",
        lot: "TESTLOT1",
        expiry: "2030-01-01",
      },
      1,
      db,
    );
    expect(added.status).toBe("success");
    expect(await unmappedFor("open")).toHaveLength(0);
    expect(await unmappedFor("resolved")).toHaveLength(1);
  });

  it("HIBC pull offers on-hand lots, earliest expiry first, and pulls the picked lot", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    await applyStationScan(
      { mode: "arrive", rawBarcode: CARDIVA_HIBC_SAMPLE, lot: "LATERLOT", expiry: "2035-01-01" },
      1,
      db,
    );
    await applyStationScan(
      { mode: "arrive", rawBarcode: CARDIVA_HIBC_SAMPLE, lot: "SOONERLOT", expiry: "2029-01-01" },
      1,
      db,
    );

    const ep = await openStationCase(1, db);
    const ask = await applyStationScan(
      { mode: "pull", rawBarcode: CARDIVA_HIBC_SAMPLE, caseId: ep.id },
      1,
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
    expect(ask.suggestedLot).toBe(ask.lots[0]!.lot);

    const first = ask.lots[0]!;
    const pulled = await applyStationScan(
      {
        mode: "pull",
        rawBarcode: CARDIVA_HIBC_SAMPLE,
        caseId: ep.id,
        lot: first.lot,
        expiry: first.expiry,
      },
      1,
      db,
    );
    expect(pulled.status).toBe("success");
    if (pulled.status === "success") expect(pulled.item.lot).toBe(first.lot);

    const lots = await listPullableLots(2, new Date(), db);
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
    const unmappedCount = async () =>
      (await listExceptions({ type: "bill_only_unmapped" }, db)).length;
    const unmappedBefore = await unmappedCount();

    const pairs = [
      { product: TERUMO_8FR, item: gtinLabel(TERUMO_8FR), lot: gs1LotLabel(TERUMO_8FR) },
      { product: TERUMO_11FR, item: gtinLabel(TERUMO_11FR), lot: gs1LotLabel(TERUMO_11FR) },
      { product: NUVISION_NAV, item: gtinLabel(NUVISION_NAV), lot: gs1LotLabel(NUVISION_NAV) },
      {
        product: CARDIVA_VASCADE,
        item: hibcPrimaryLabel(CARDIVA_VASCADE),
        lot: hibcSecondaryLabel(CARDIVA_VASCADE),
      },
    ];
    for (const { product, item, lot } of pairs) {
      const before = await onHand(product.id, product.lot);
      const first = await applyStationScan({ mode: "arrive", rawBarcode: item }, 1, db);
      expect(first.status).toBe("needs_lot");
      if (first.status !== "needs_lot") continue;
      expect(first.product.productId).toBe(product.id);
      expect(first.message).toMatch(/lot and expiry barcode/);

      const second = await applyStationScan(
        { mode: "arrive", rawBarcode: lot, pendingRaw: first.raw },
        1,
        db,
      );
      expect(second.status).toBe("success");
      if (second.status !== "success") continue;
      expect(second.item.productId).toBe(product.id);
      expect(second.item.lot).toBe(product.lot);
      expect(second.item.expiry).toBe(product.expiry);
      expect(second.notice).toBeNull();
      expect(second.reads).toHaveLength(2);
      expect(await onHand(product.id, product.lot)).toBe(before + 1);
    }

    const alone = await applyStationScan(
      { mode: "arrive", rawBarcode: gs1LotLabel(TERUMO_8FR) },
      1,
      db,
    );
    expect(alone.status).toBe("error");
    if (alone.status === "error") expect(alone.code).toBe("no_item");

    const wrongItem = await applyStationScan(
      {
        mode: "arrive",
        rawBarcode: hibcSecondaryLabel(CARDIVA_VASCADE),
        pendingRaw: "+HDEMOC0007",
      },
      1,
      db,
    );
    expect(wrongItem.status).toBe("error");
    expect(await unmappedCount()).toBe(unmappedBefore);

    const ep = await openStationCase(1, db);
    const ask = await applyStationScan(
      { mode: "pull", rawBarcode: gtinLabel(TERUMO_11FR), caseId: ep.id },
      1,
      db,
    );
    expect(ask.status).toBe("needs_lot");
    if (ask.status !== "needs_lot") return;
    expect(ask.lots.map((row) => row.lot)).toContain(TERUMO_11FR.lot);
    const pulled = await applyStationScan(
      {
        mode: "pull",
        rawBarcode: gs1LotLabel(TERUMO_11FR),
        caseId: ep.id,
        pendingRaw: ask.raw,
      },
      1,
      db,
    );
    expect(pulled.status).toBe("success");

    const back = await applyStationScan(
      { mode: "return", rawBarcode: gtinLabel(TERUMO_11FR), caseId: ep.id },
      1,
      db,
    );
    expect(back.status).toBe("needs_lot");
    if (back.status === "needs_lot") {
      expect(back.lots).toEqual([
        expect.objectContaining({ lot: TERUMO_11FR.lot, expiry: TERUMO_11FR.expiry, onHand: 1 }),
      ]);
    }
  });

  it("the hospital-owned DECA pack opens one 'not on any contract' exception", async () => {
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

    const arrive = await applyStationScan(
      {
        mode: "arrive",
        rawBarcode: DECA_CABLE_PACK.catalogNumber,
        lot: "SPD-TEST-2",
        expiry: "2027-06-01",
      },
      1,
      db,
    );
    expect(arrive.status).toBe("success");
    if (arrive.status === "success") {
      expect(arrive.item.hospitalOwned).toBe(true);
      expect(arrive.notice).toMatch(/not on any contract/i);
    }

    const ep = await openStationCase(1, db);
    const pull = await applyStationScan(
      {
        mode: "pull",
        rawBarcode: DECA_CABLE_PACK.catalogNumber,
        caseId: ep.id,
        lot: "SPD-TEST-2",
        expiry: "2027-06-01",
      },
      1,
      db,
    );
    expect(pull.status).toBe("success");

    const open = await openFor();
    expect(open).toHaveLength(1);
    expect(open[0]?.sourceContainer).toBe(1);
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

    const sheath = await applyStationScan(
      { mode: "arrive", rawBarcode: TERUMO_GS1_SAMPLE },
      1,
      db,
    );
    expect(sheath.status === "success" && sheath.notice).toBe(null);
    expect(
      (await listExceptions({ type: "not_on_any_contract" }, db)).every(
        (row) => row.productId === DECA_CABLE_PACK.id,
      ),
    ).toBe(true);
  });
});
