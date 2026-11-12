import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CARDIVA_HIBC_SAMPLE,
  TERUMO_GS1_SAMPLE,
} from "@/lib/barcode";
import { identifyProduct, recordArrival } from "@/lib/arrival";
import { stockOnHand } from "@/lib/stock";

describe("scan on arrival", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-arrival-test-${Date.now()}.sqlite`);
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

  it("Terumo GS1 identifies product and fills lot/expiry; arrival updates on-hand", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const { parsed, product } = await identifyProduct(TERUMO_GS1_SAMPLE, db);
    expect(product?.catalogNumber).toBe("RSS802");
    expect(parsed.lot).toBe("0001681425");
    expect(parsed.expiry).toBe("2028-11-01");

    const before = await stockOnHand({ productId: 1 }, db);
    const beforeLot =
      before.find((r) => r.lot === "0001681425" && r.locationId === 1)?.onHand ??
      0;

    await recordArrival(
      {
        rawBarcode: TERUMO_GS1_SAMPLE,
        productId: product!.productId,
        locationId: 1,
        lot: parsed.lot!,
        expiry: parsed.expiry!,
        qty: 1,
        barcodeFormat: "gs1",
        lotExpirySource: "barcode",
      },
      1,
      db,
    );

    const after = await stockOnHand({ productId: 1 }, db);
    const afterLot = after.find(
      (r) => r.lot === "0001681425" && r.locationId === 1,
    )?.onHand;
    expect(afterLot).toBe(beforeLot + 1);
  });

  it("Cardiva HIBC identifies product but requires manual lot/expiry; arrival updates on-hand", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const { parsed, product } = await identifyProduct(CARDIVA_HIBC_SAMPLE, db);
    expect(product?.catalogNumber).toBe("800-612C");
    expect(parsed.lot).toBeNull();
    expect(parsed.expiry).toBeNull();

    const before = await stockOnHand({ productId: 2 }, db);
    const beforeLot =
      before.find((r) => r.lot === "G612C260420B" && r.locationId === 1)
        ?.onHand ?? 0;

    await recordArrival(
      {
        rawBarcode: CARDIVA_HIBC_SAMPLE,
        productId: product!.productId,
        locationId: 1,
        lot: "G612C260420B",
        expiry: "2028-04-09",
        qty: 1,
        barcodeFormat: "hibc",
        lotExpirySource: "manual",
      },
      1,
      db,
    );

    const after = await stockOnHand({ productId: 2 }, db);
    const afterLot = after.find(
      (r) => r.lot === "G612C260420B" && r.locationId === 1,
    )?.onHand;
    expect(afterLot).toBe(beforeLot + 1);
  });
});
