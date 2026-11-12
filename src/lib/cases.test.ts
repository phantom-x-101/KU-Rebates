import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exceptions } from "@/db/schema";
import {
  abortCase,
  closeCase,
  listCasePullLines,
  openCase,
} from "@/lib/cases";
import {
  closeoutReturned,
  closeoutUsed,
  closeoutWasted,
} from "@/lib/closeout";
import { recordPull } from "@/lib/pull";
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
    const ablBefore = await soh(3, "VCABL1001");

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

    const abl = await identifyProduct("VC-ABL-01", db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "VC-ABL-01",
        productId: abl.product!.productId,
        locationId: 1,
        lot: "VCABL1001",
        expiry: "2027-06-01",
        qty: 1,
        lotExpirySource: "manual",
      },
      1,
      db,
    );

    expect(await soh(1, "0001681425")).toBe(sheathBefore - 1);
    expect(await soh(2, "G612C260420B")).toBe(closureBefore - 1);
    expect(await soh(3, "VCABL1001")).toBe(ablBefore - 1);

    // Close-out: 2 used + 1 returned (spec example shape)
    await closeoutUsed(
      {
        caseId: c.id,
        productId: 1,
        locationId: 1,
        lot: "0001681425",
        expiry: "2028-11-01",
        qty: 1,
      },
      1,
      db,
    );
    await closeoutUsed(
      {
        caseId: c.id,
        productId: 2,
        locationId: 1,
        lot: "G612C260420B",
        expiry: "2028-04-09",
        qty: 1,
      },
      1,
      db,
    );
    await closeoutReturned(
      {
        caseId: c.id,
        productId: 3,
        locationId: 1,
        lot: "VCABL1001",
        expiry: "2027-06-01",
        qty: 1,
      },
      1,
      db,
    );

    // Used items stay off shelf; returned ablation is back
    expect(await soh(1, "0001681425")).toBe(sheathBefore - 1);
    expect(await soh(2, "G612C260420B")).toBe(closureBefore - 1);
    expect(await soh(3, "VCABL1001")).toBe(ablBefore);

    const lines = await listCasePullLines(c.id, db);
    expect(lines.every((l) => l.remaining === 0)).toBe(true);

    await closeCase(c.id, 1, db);
    const closed = await listCasePullLines(c.id, db);
    expect(closed.length).toBe(3);
  });

  it("wasted creates opened_or_wasted exception; abort works", async () => {
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

    const { exception } = await closeoutWasted(
      {
        caseId: c.id,
        productId: 1,
        locationId: 1,
        lot: "0001681425",
        expiry: "2028-11-01",
        qty: 1,
      },
      1,
      db,
    );
    expect(exception.type).toBe("opened_or_wasted");
    expect(exception.sourceContainer).toBe(1);

    const rows = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.id, exception.id));
    expect(rows[0]?.type).toBe("opened_or_wasted");

    const c2 = await openCase({ departmentId: 1, roomId: 1 }, 1, db);
    const aborted = await abortCase(c2.id, 1, db);
    expect(aborted.status).toBe("aborted");
  });
});
