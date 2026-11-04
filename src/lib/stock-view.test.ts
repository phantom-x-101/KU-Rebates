import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exceptions, stockEvents } from "@/db/schema";
import { stockOnHand } from "@/lib/stock";
import {
  disposeExpiredLot,
  ensureExpiredOnShelfExceptions,
  listStockView,
} from "@/lib/stock-view";
import { listReorderView } from "@/lib/reorder";

describe("Phase 6 stock, expiry, reorder", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-stock-view-test-${Date.now()}.sqlite`);
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
    (globalThis as any).__kuDb = undefined;
    if (prevPath === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prevPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("flags seeded EXPIRINGSOON1 as expiring soon", async () => {
    const { createDb } = await import("@/db");
    const { db } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite: undefined };

    const rows = await listStockView({}, new Date(), db);
    const soon = rows.find((r) => r.lot === "EXPIRINGSOON1");
    expect(soon).toBeTruthy();
    expect(soon!.flag).toBe("expiring_soon");
    expect(soon!.onHand).toBe(1);
  });

  it("dispose expired removes lot from on-hand; expired_on_shelf exception created", async () => {
    const { createDb } = await import("@/db");
    const { db } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite: undefined };

    // Seed an already-expired lot
    await db.insert(stockEvents).values({
      eventType: "arrived",
      productId: 1,
      locationId: 1,
      lot: "EXPIREDLOT1",
      expiry: "2020-01-01",
      qty: 2,
      byUserId: 2,
    });

    const view = await listStockView({ flag: "expired" }, new Date(), db);
    const expired = view.find((r) => r.lot === "EXPIREDLOT1");
    expect(expired?.onHand).toBe(2);

    const ensured = await ensureExpiredOnShelfExceptions(2, new Date(), db);
    expect(ensured.createdExceptionIds.length).toBeGreaterThanOrEqual(1);

    const exc = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "expired_on_shelf"),
          eq(exceptions.productId, 1),
          eq(exceptions.status, "open"),
        ),
      );
    expect(exc.length).toBeGreaterThanOrEqual(1);

    await disposeExpiredLot(
      {
        productId: 1,
        locationId: 1,
        lot: "EXPIREDLOT1",
        expiry: "2020-01-01",
      },
      2,
      db,
    );

    const after = await stockOnHand({ productId: 1 }, db);
    expect(after.find((r) => r.lot === "EXPIREDLOT1")).toBeUndefined();
  });

  it("flags low-stock products vs par in reorder view (no order action)", async () => {
    const { createDb } = await import("@/db");
    const { db } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite: undefined };

    const rows = await listReorderView(db);
    // Terumo sheath par 4; seed on-hand for lot 0001681425 is 1 + EXPIRINGSOON1 is 1 = 2 at loc 1
    const sheath = rows.find((r) => r.catalogNumber === "RSS802");
    expect(sheath).toBeTruthy();
    expect(sheath!.parLevel).toBe(4);
    expect(sheath!.onHand).toBeLessThan(sheath!.parLevel!);
    expect(sheath!.lowStock).toBe(true);
    expect(sheath!.suggestion.toLowerCase()).toContain("low stock");
    expect(sheath!.suggestion.toLowerCase()).toContain("pycube does not");
  });
});
