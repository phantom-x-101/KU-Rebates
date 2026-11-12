import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/db/schema";
import {
  canAccessVendorPortal,
  listVendorExpiryAlerts,
  listVendorStock,
  listVendorUsage,
  requireVendorRepScope,
} from "@/lib/vendor-portal";

const TERUMO_VENDOR_ID = 1;
const CARDIVA_VENDOR_ID = 2;

const terumoRep: User = {
  id: 5,
  name: "Terry Terumo Rep",
  email: "terry.rep@terumo.example",
  role: "vendor_rep",
  vendorId: TERUMO_VENDOR_ID,
  active: 1,
};

describe("vendor portal scope helpers", () => {
  it("allows vendor_rep with vendorId", () => {
    const scope = requireVendorRepScope(terumoRep);
    expect(scope.vendorId).toBe(TERUMO_VENDOR_ID);
    expect(canAccessVendorPortal(terumoRep)).toBe(true);
  });

  it("denies tech / supply_chain / admin / null", () => {
    expect(
      canAccessVendorPortal({
        ...terumoRep,
        id: 1,
        role: "tech",
        vendorId: null,
      }),
    ).toBe(false);
    expect(
      canAccessVendorPortal({
        ...terumoRep,
        id: 2,
        role: "supply_chain",
        vendorId: null,
      }),
    ).toBe(false);
    expect(canAccessVendorPortal(null)).toBe(false);
    expect(() =>
      requireVendorRepScope({
        ...terumoRep,
        role: "admin",
        vendorId: null,
      }),
    ).toThrow(/vendor_rep/);
  });
});

describe("Terumo rep cannot read Cardiva", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-vendor-portal-${Date.now()}.sqlite`);
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

  async function freshDb() {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;
    return created.db;
  }

  it("listVendorStock(Terumo) never returns Cardiva products", async () => {
    const db = await freshDb();
    const terumoStock = await listVendorStock(TERUMO_VENDOR_ID, {}, new Date(), db);
    expect(terumoStock.length).toBeGreaterThan(0);
    expect(terumoStock.every((r) => r.vendorId === TERUMO_VENDOR_ID)).toBe(
      true,
    );
    expect(
      terumoStock.some(
        (r) =>
          r.vendorId === CARDIVA_VENDOR_ID ||
          r.catalogNumber === "800-612C" ||
          r.vendorName.toLowerCase().includes("cardiva"),
      ),
    ).toBe(false);

    const cardivaStock = await listVendorStock(
      CARDIVA_VENDOR_ID,
      {},
      new Date(),
      db,
    );
    expect(cardivaStock.some((r) => r.catalogNumber === "800-612C")).toBe(true);
    expect(cardivaStock.every((r) => r.vendorId === CARDIVA_VENDOR_ID)).toBe(
      true,
    );
    // Isolation: Terumo view and Cardiva view share no product ids
    const terumoIds = new Set(terumoStock.map((r) => r.productId));
    const cardivaIds = new Set(cardivaStock.map((r) => r.productId));
    for (const id of cardivaIds) {
      expect(terumoIds.has(id)).toBe(false);
    }
  });

  it("listVendorUsage(Terumo) never includes Cardiva usage rows", async () => {
    const db = await freshDb();
    const terumoUsage = await listVendorUsage(TERUMO_VENDOR_ID, {}, db);
    expect(terumoUsage.length).toBeGreaterThan(0);
    expect(
      terumoUsage.every(
        (r) =>
          r.catalogNumber !== "800-612C" &&
          !r.description.toLowerCase().includes("cardiva"),
      ),
    ).toBe(true);
    // Seeded EP case used Terumo sheath
    expect(terumoUsage.some((r) => r.catalogNumber === "RSS802")).toBe(true);

    const cardivaUsage = await listVendorUsage(CARDIVA_VENDOR_ID, {}, db);
    expect(cardivaUsage.some((r) => r.catalogNumber === "800-612C")).toBe(true);
    expect(cardivaUsage.some((r) => r.catalogNumber === "RSS802")).toBe(false);

    // Case identity fields only expose date / room / procedure
    for (const row of terumoUsage) {
      expect(row).toHaveProperty("caseDate");
      expect(row).toHaveProperty("roomName");
      expect(row).toHaveProperty("procedureTypeName");
      expect(row).not.toHaveProperty("mrn");
      expect(row).not.toHaveProperty("patientName");
    }
  });

  it("listVendorExpiryAlerts stays within own vendor", async () => {
    const db = await freshDb();
    // Use a fixed "today" so seeded near-expiry lots surface if present
    const alerts = await listVendorExpiryAlerts(
      TERUMO_VENDOR_ID,
      new Date("2028-10-01T00:00:00Z"),
      db,
    );
    expect(alerts.every((a) => a.vendorId === TERUMO_VENDOR_ID)).toBe(true);
    expect(
      alerts.some(
        (a) =>
          a.vendorId === CARDIVA_VENDOR_ID || a.catalogNumber === "800-612C",
      ),
    ).toBe(false);
  });

  it("requireVendorRepScope always binds Terumo rep to vendor 1 (not Cardiva)", () => {
    const scope = requireVendorRepScope(terumoRep);
    expect(scope.vendorId).toBe(TERUMO_VENDOR_ID);
    expect(scope.vendorId).not.toBe(CARDIVA_VENDOR_ID);
  });
});
