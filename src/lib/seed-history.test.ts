import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CARDIVA_VASCADE,
  DECA_CABLE_PACK,
  DEMO_EXPIRED_LOT,
  DEMO_SOON_LOT,
  NUVISION_NAV,
  TERUMO_11FR,
  TERUMO_8FR,
} from "@/lib/real-products";

describe("vendor-led demo seed", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-seed-history-${Date.now()}.sqlite`);
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

  it("keeps three vendors, real products, and a compact demo story", async () => {
    const { createDb } = await import("@/db");
    const { stockOnHand } = await import("@/lib/stock");
    const {
      cases,
      contractLineProducts,
      products,
      users,
      vendors,
    } = await import("@/db/schema");
    const { db, sqlite } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite };

    const onHand = await stockOnHand({}, db);
    const byKey = Object.fromEntries(
      onHand.map((row) => [`${row.productId}|${row.lot}`, row.onHand]),
    );
    expect(byKey[`${TERUMO_8FR.id}|${TERUMO_8FR.lot}`]).toBe(1);
    expect(byKey[`${CARDIVA_VASCADE.id}|${CARDIVA_VASCADE.lot}`]).toBe(1);
    expect(byKey[`${CARDIVA_VASCADE.id}|${DEMO_SOON_LOT}`]).toBe(1);
    expect(byKey[`${TERUMO_11FR.id}|${TERUMO_11FR.lot}`]).toBe(2);
    expect(byKey[`${TERUMO_11FR.id}|${DEMO_EXPIRED_LOT}`]).toBe(1);
    expect(byKey[`${NUVISION_NAV.id}|${NUVISION_NAV.lot}`]).toBe(1);
    expect(byKey[`${DECA_CABLE_PACK.id}|${DECA_CABLE_PACK.lot}`]).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const caseRows = await db.select().from(cases);
    expect(caseRows).toHaveLength(7);
    expect(caseRows.filter((row) => row.openedAt.startsWith(today))).toHaveLength(0);
    expect(caseRows.filter((row) => row.status === "open")).toHaveLength(1);

    const catalog = await db.select().from(products);
    expect(catalog).toHaveLength(7);
    expect(catalog.filter((row) => row.kuOwned === 1).map((row) => row.id)).toEqual([
      DECA_CABLE_PACK.id,
    ]);

    const vendorNames = (await db.select().from(vendors)).map((row) => row.name).sort();
    expect(vendorNames).toEqual(["Cardiva", "In-house", "NuVision", "Terumo"]);

    const userNames = (await db.select().from(users)).map((row) => row.name);
    expect(userNames).toEqual([
      "Alex",
      "Sam",
      "Terry Terumo",
      "Pat Cardiva",
      "Nico NuVision",
    ]);

    const links = await db.select().from(contractLineProducts);
    const linked = new Set(links.map((row) => row.productId));
    expect(linked.has(DECA_CABLE_PACK.id)).toBe(false);
    expect(linked.has(TERUMO_8FR.id)).toBe(true);
    expect(linked.has(CARDIVA_VASCADE.id)).toBe(true);
    expect(linked.has(NUVISION_NAV.id)).toBe(true);

    const expired = onHand.filter(
      (row) => row.expiry && row.onHand > 0 && row.expiry < today,
    );
    expect(expired.some((row) => row.lot === DEMO_EXPIRED_LOT)).toBe(true);
    const start = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    );
    const expiring = onHand.filter((row) => {
      if (!row.expiry || row.onHand <= 0) return false;
      const days = (Date.parse(`${row.expiry}T00:00:00Z`) - start) / 86400000;
      return days >= 0 && days <= 30;
    });
    expect(expiring.some((row) => row.lot === DEMO_SOON_LOT)).toBe(true);
  });
});
