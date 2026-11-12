import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canAccessDashboard,
  getSupplyChainDashboard,
} from "@/lib/dashboard";

describe("supply chain dashboard access", () => {
  it("allows supply_chain and admin only", () => {
    expect(
      canAccessDashboard({
        id: 2,
        name: "Sam",
        email: null,
        role: "supply_chain",
        vendorId: null,
        active: 1,
      }),
    ).toBe(true);
    expect(
      canAccessDashboard({
        id: 4,
        name: "Ada",
        email: null,
        role: "admin",
        vendorId: null,
        active: 1,
      }),
    ).toBe(true);
    expect(
      canAccessDashboard({
        id: 1,
        name: "Tech",
        email: null,
        role: "tech",
        vendorId: null,
        active: 1,
      }),
    ).toBe(false);
    expect(
      canAccessDashboard({
        id: 5,
        name: "Rep",
        email: null,
        role: "vendor_rep",
        vendorId: 1,
        active: 1,
      }),
    ).toBe(false);
  });
});

describe("getSupplyChainDashboard against seed", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-dashboard-${Date.now()}.sqlite`);
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

  it("leaves today empty, with open exceptions, expiring ≤30d, and low stock", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const dash = await getSupplyChainDashboard(new Date(), created.db);

    expect(dash.takenTodayQty).toBe(0);
    expect(dash.takenToday).toHaveLength(0);
    expect(dash.openExceptions.length).toBeGreaterThan(0);
    expect(
      dash.openExceptions.some(
        (e) => e.type === "taken_not_scanned_or_returned",
      ),
    ).toBe(true);
    expect(dash.expiringIn30Days.length).toBeGreaterThan(0);
    expect(
      dash.expiringIn30Days.some((r) => r.lot === "EXPIRINGSOON1"),
    ).toBe(true);
    expect(dash.lowStock.length).toBeGreaterThan(0);
    expect(dash.lowStock.every((r) => r.onHand < (r.parLevel ?? Infinity))).toBe(
      true,
    );
  });
});
