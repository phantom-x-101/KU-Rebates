import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exceptions } from "@/db/schema";
import {
  abortCase,
  closeCase,
  listCasePullLines,
  openCase,
} from "@/lib/cases";
import { closeoutReturned } from "@/lib/closeout";
import { recordPull } from "@/lib/pull";
import { reconcileCase } from "@/lib/reconcile";
import { stockOnHand } from "@/lib/stock";
import {
  CARDIVA_HIBC_SAMPLE,
  TERUMO_GS1_SAMPLE,
} from "@/lib/barcode";
import { identifyProduct } from "@/lib/arrival";

describe("Phase 4 EP case end to end", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-cases-test-${Date.now()}.sqlite`);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const held = (globalThis as any).__kuDb as { sqlite?: { close: () => void } } | undefined;
    held?.sqlite?.close();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    if (prevPath === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prevPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("runs EP case: open, pull, close-out used/returned, stock updates", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const soh = async (productId: number, lot: string) => {
      const rows = await stockOnHand({ productId }, db);
      return rows.find((r) => r.lot === lot && r.locationId === 1)?.onHand ?? 0;
    };

    const sheathBefore = await soh(1, "0001681425");
    const closureBefore = await soh(2, "G612C260420B");
    const sheath11Before = await soh(3, "0001476667");

    const c = await openCase(
      { departmentId: 1, roomId: 1, procedureTypeId: 1 },
      1,
      db,
    );
    expect(c.status).toBe("open");

    const terumo = await identifyProduct(TERUMO_GS1_SAMPLE, db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: TERUMO_GS1_SAMPLE,
        productId: terumo.product!.productId,
        locationId: 1,
        lot: terumo.parsed.lot!,
        expiry: terumo.parsed.expiry!,
        qty: 1,
        lotExpirySource: "barcode",
      },
      1,
      db,
    );

    const cardiva = await identifyProduct(CARDIVA_HIBC_SAMPLE, db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: CARDIVA_HIBC_SAMPLE,
        productId: cardiva.product!.productId,
        locationId: 1,
        lot: "G612C260420B",
        expiry: "2028-04-09",
        qty: 1,
        lotExpirySource: "manual",
      },
      1,
      db,
    );

    const sheath11 = await identifyProduct("RSS106", db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "RSS106",
        productId: sheath11.product!.productId,
        locationId: 1,
        lot: "0001476667",
        expiry: "2028-07-01",
        qty: 1,
        lotExpirySource: "manual",
      },
      1,
      db,
    );

    expect(await soh(1, "0001681425")).toBe(sheathBefore - 1);
    expect(await soh(2, "G612C260420B")).toBe(closureBefore - 1);
    expect(await soh(3, "0001476667")).toBe(sheath11Before - 1);

    await closeoutReturned(
      {
        caseId: c.id,
        productId: 3,
        locationId: 1,
        lot: "0001476667",
        expiry: "2028-07-01",
        qty: 1,
      },
      1,
      db,
    );

    expect(await soh(1, "0001681425")).toBe(sheathBefore - 1);
    expect(await soh(2, "G612C260420B")).toBe(closureBefore - 1);
    expect(await soh(3, "0001476667")).toBe(sheath11Before);

    const lines = await listCasePullLines(c.id, db);
    expect(lines.map((l) => [l.productId, l.remaining]).sort()).toEqual([
      [1, 1],
      [2, 1],
      [3, 0],
    ]);

    const excBefore = (await db.select().from(exceptions)).length;
    await closeCase(c.id, 1, db);
    const closed = await listCasePullLines(c.id, db);
    expect(closed.length).toBe(3);
    const summary = await reconcileCase(c.id, db);
    expect(summary).toMatchObject({ taken: 3, returned: 1, used: 2 });
    expect((await db.select().from(exceptions)).length).toBe(excBefore);
  });

  it("abort works and creates no exception", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const c = await openCase(
      { departmentId: 1, roomId: 1, procedureTypeId: 1 },
      1,
      db,
    );
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "RSS802",
        productId: 1,
        locationId: 1,
        lot: "0001681425",
        expiry: "2028-11-01",
        qty: 1,
      },
      1,
      db,
    );

    const excBefore = (await db.select().from(exceptions)).length;
    const aborted = await abortCase(c.id, 1, db);
    expect(aborted.status).toBe("aborted");
    expect((await db.select().from(exceptions)).length).toBe(excBefore);
  });
});
