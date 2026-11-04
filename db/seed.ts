/**
 * Demo seed for the KU Rebate consignment prototype.
 * Placeholders: Vendor C and invented quantities are marked as such.
 * No patient identifiers. No write-back to Epic/GE/Workday.
 */
import fs from "node:fs";
import path from "node:path";
import { createDb } from "../src/db";
import { audit } from "../src/lib/audit";
import {
  appSettings,
  cases,
  departments,
  exceptions,
  expiryRules,
  productAccess,
  productIdentifiers,
  products,
  procedureTypes,
  rooms,
  scans,
  stockEvents,
  storageLocations,
  users,
  vendors,
} from "../src/db/schema";

const dbPath = process.env.KU_DB_PATH ?? path.join(process.cwd(), "data", "ku.sqlite");

function resetFile() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

async function pushSchema() {
  const { execSync } = await import("node:child_process");
  execSync(`npx drizzle-kit push --force`, {
    stdio: "inherit",
    env: { ...process.env, KU_DB_PATH: dbPath },
  });
}

async function main() {
  resetFile();
  // Clear any hot-reload singleton before push/seed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__kuDb = undefined;

  await pushSchema();

  const { db } = createDb(dbPath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__kuDb = { db, sqlite: undefined };

  // --- Vendors ---
  await db.insert(vendors).values([
    { id: 1, name: "Terumo" },
    { id: 2, name: "Cardiva" },
    { id: 3, name: "Vendor C" }, // placeholder
  ]);
  await audit({
    userId: null,
    container: 1,
    entity: "vendors",
    action: "seed",
    detail: "Terumo, Cardiva, Vendor C (placeholder)",
  }, db);

  // --- Users (five roles, no passwords) ---
  await db.insert(users).values([
    { id: 1, name: "Alex Tech", email: "alex.tech@ku.example", role: "tech", active: 1 },
    {
      id: 2,
      name: "Sam Supply",
      email: "sam.supply@ku.example",
      role: "supply_chain",
      active: 1,
    },
    {
      id: 3,
      name: "Casey Category",
      email: "casey.category@ku.example",
      role: "category_owner",
      active: 1,
    },
    { id: 4, name: "Admin Ada", email: "admin.ada@ku.example", role: "admin", active: 1 },
    {
      id: 5,
      name: "Terry Terumo Rep",
      email: "terry.rep@terumo.example",
      role: "vendor_rep",
      vendorId: 1,
      active: 1,
    },
  ]);
  await audit({
    userId: 4,
    container: 1,
    entity: "users",
    action: "seed",
    detail: "Five demo users (tech, supply_chain, category_owner, admin, vendor_rep)",
  }, db);

  // --- Departments / rooms / procedure types ---
  await db.insert(departments).values([
    { id: 1, name: "EP lab", phase: "pilot" },
    { id: 2, name: "Cath lab", phase: "next" },
    { id: 3, name: "Ortho", phase: "later" },
  ]);
  await db.insert(rooms).values([
    { id: 1, departmentId: 1, name: "EP 1" },
  ]);
  await db.insert(procedureTypes).values([
    { id: 1, departmentId: 1, name: "ablation" },
  ]);
  await audit({
    userId: 4,
    container: 1,
    entity: "departments",
    action: "seed",
    detail: "EP lab (pilot), Cath lab (next), Ortho (later)",
  }, db);

  // --- Products ---
  await db.insert(products).values([
    {
      id: 1,
      vendorId: 1,
      catalogNumber: "RSS802",
      description: "Terumo Pinnacle sheath 8 Fr",
      category: "sheath",
      inItemMaster: 1,
    },
    {
      id: 2,
      vendorId: 2,
      catalogNumber: "800-612C",
      description: "Cardiva Vascade MVP closure",
      category: "closure",
      inItemMaster: 1,
    },
    {
      id: 3,
      vendorId: 3,
      catalogNumber: "VC-ABL-01",
      description: "Vendor C ablation catheter (placeholder)",
      category: "ablation catheter",
      inItemMaster: 0,
    },
    {
      id: 4,
      vendorId: 3,
      catalogNumber: "VC-MAP-01",
      description: "Vendor C mapping catheter (placeholder)",
      category: "mapping catheter",
      inItemMaster: 0,
    },
  ]);
  await db.insert(productIdentifiers).values([
    { id: 1, productId: 1, idType: "catalog", value: "RSS802" },
    { id: 2, productId: 1, idType: "gtin", value: "00380628008026" }, // placeholder GTIN
    { id: 3, productId: 2, idType: "catalog", value: "800-612C" },
    { id: 4, productId: 2, idType: "hibc", value: "+H83800612C0" }, // placeholder HIBC
    { id: 5, productId: 3, idType: "catalog", value: "VC-ABL-01" },
    { id: 6, productId: 4, idType: "catalog", value: "VC-MAP-01" },
  ]);
  await audit({
    userId: 4,
    container: 1,
    entity: "products",
    action: "seed",
    detail: "RSS802, 800-612C, VC-ABL-01, VC-MAP-01",
  }, db);

  // --- Storage / access / expiry ---
  await db.insert(storageLocations).values([
    { id: 1, departmentId: 1, name: "EP shelf", storageType: "shelf" },
  ]);
  await db.insert(productAccess).values([
    {
      productId: 1,
      departmentId: 1,
      accessMode: "on_shelf",
      locationId: 1,
      parLevel: 4,
    },
    {
      productId: 2,
      departmentId: 1,
      accessMode: "on_shelf",
      locationId: 1,
      parLevel: 3,
    },
    {
      productId: 3,
      departmentId: 1,
      accessMode: "brought_in_for_case",
      locationId: 1,
      parLevel: null,
    },
    {
      productId: 4,
      departmentId: 1,
      accessMode: "brought_in_for_case",
      locationId: 1,
      parLevel: null,
    },
  ]);
  await db.insert(expiryRules).values([
    { id: 1, vendorId: 1, daysBefore: 60, vendorPaysExpired: 1 },
    { id: 2, vendorId: 2, daysBefore: 60, vendorPaysExpired: 1 },
    { id: 3, vendorId: 3, daysBefore: 30, vendorPaysExpired: 1 },
  ]);

  await db.insert(appSettings).values([
    { key: "epic_integration", value: "off" },
    { key: "workday_integration", value: "off" },
    { key: "default_count_basis", value: "used" },
    { key: "default_forecast_method", value: "run_rate" },
  ]);

  // --- Stock arrivals (on hand before the case) ---
  // Terumo sheath lot: arrived 3
  // Cardiva closure: arrived 2
  // Vendor C ablation: arrived 2
  // Vendor C mapping: arrived 3
  // Extra Terumo lot expiring within 30 days: arrived 1 (for expiry demo)
  const soonExpiry = new Date();
  soonExpiry.setUTCDate(soonExpiry.getUTCDate() + 20);
  const soonExpiryIso = soonExpiry.toISOString().slice(0, 10);

  await db.insert(stockEvents).values([
    {
      eventType: "arrived",
      productId: 1,
      locationId: 1,
      lot: "0001681425",
      expiry: "2028-11-01",
      qty: 3,
      byUserId: 2,
      at: "2026-01-10T10:00:00",
    },
    {
      eventType: "arrived",
      productId: 1,
      locationId: 1,
      lot: "EXPIRINGSOON1",
      expiry: soonExpiryIso,
      qty: 1,
      byUserId: 2,
      at: "2026-01-10T10:05:00",
    },
    {
      eventType: "arrived",
      productId: 2,
      locationId: 1,
      lot: "G612C260420B",
      expiry: "2028-04-09",
      qty: 2,
      byUserId: 2,
      at: "2026-01-10T10:10:00",
    },
    {
      eventType: "arrived",
      productId: 3,
      locationId: 1,
      lot: "VCABL1001",
      expiry: "2027-06-01",
      qty: 2,
      byUserId: 2,
      at: "2026-01-10T10:15:00",
    },
    {
      eventType: "arrived",
      productId: 4,
      locationId: 1,
      lot: "VCMAP2001",
      expiry: "2027-08-15",
      qty: 3,
      byUserId: 2,
      at: "2026-01-10T10:20:00",
    },
  ]);
  await audit({
    userId: 2,
    container: 1,
    entity: "stock_events",
    action: "seed_arrived",
    detail: "Initial shelf stock for EP demo",
  }, db);

  // --- EP case: 5 pulled; close-out 4 used + 1 returned; one gap item left open ---
  // Spec: sheath, closure, ablation, mapping x2 pulled.
  // Close-out story for demo: 4 used, 1 returned on closed items;
  // seed one extra pull (gap) as taken_not_scanned_or_returned for later phases.
  await db.insert(cases).values({
    id: 1,
    departmentId: 1,
    roomId: 1,
    procedureTypeId: 1,
    openedAt: "2026-02-01T08:00:00",
    closedAt: "2026-02-01T10:30:00",
    openedBy: 1,
    status: "closed",
  });
  await audit({
    userId: 1,
    container: 2,
    entity: "cases",
    entityId: 1,
    action: "seed_open_close",
    detail: "EP ablation demo case",
  }, db);

  await db.insert(stockEvents).values([
    {
      eventType: "pulled",
      productId: 1,
      locationId: 1,
      caseId: 1,
      lot: "0001681425",
      expiry: "2028-11-01",
      qty: 1,
      byUserId: 1,
      at: "2026-02-01T08:15:00",
    },
    {
      eventType: "pulled",
      productId: 2,
      locationId: 1,
      caseId: 1,
      lot: "G612C260420B",
      expiry: "2028-04-09",
      qty: 1,
      byUserId: 1,
      at: "2026-02-01T08:16:00",
    },
    {
      eventType: "pulled",
      productId: 3,
      locationId: 1,
      caseId: 1,
      lot: "VCABL1001",
      expiry: "2027-06-01",
      qty: 1,
      byUserId: 1,
      at: "2026-02-01T08:17:00",
    },
    {
      eventType: "pulled",
      productId: 4,
      locationId: 1,
      caseId: 1,
      lot: "VCMAP2001",
      expiry: "2027-08-15",
      qty: 2,
      byUserId: 1,
      at: "2026-02-01T08:18:00",
    },
    // Seeded gap: extra sheath pulled, not closed out (exception demo)
    {
      eventType: "pulled",
      productId: 1,
      locationId: 1,
      caseId: 1,
      lot: "0001681425",
      expiry: "2028-11-01",
      qty: 1,
      byUserId: 1,
      at: "2026-02-01T08:19:00",
    },
  ]);

  // Close-out: 4 used (sheath, closure, ablation, one mapping); 1 mapping returned
  await db.insert(scans).values([
    {
      id: 1,
      caseId: 1,
      scannedAt: "2026-02-01T10:00:00",
      scannedBy: 1,
      rawBarcode: "RSS802",
      barcodeFormat: "gs1",
      productId: 1,
      lot: "0001681425",
      expiry: "2028-11-01",
      lotExpirySource: "barcode",
      status: "used",
      qty: 1,
    },
    {
      id: 2,
      caseId: 1,
      scannedAt: "2026-02-01T10:01:00",
      scannedBy: 1,
      rawBarcode: "800-612C",
      barcodeFormat: "hibc",
      productId: 2,
      lot: "G612C260420B",
      expiry: "2028-04-09",
      lotExpirySource: "manual",
      status: "used",
      qty: 1,
    },
    {
      id: 3,
      caseId: 1,
      scannedAt: "2026-02-01T10:02:00",
      scannedBy: 1,
      rawBarcode: "VC-ABL-01",
      barcodeFormat: "other",
      productId: 3,
      lot: "VCABL1001",
      expiry: "2027-06-01",
      lotExpirySource: "manual",
      status: "used",
      qty: 1,
    },
    {
      id: 4,
      caseId: 1,
      scannedAt: "2026-02-01T10:03:00",
      scannedBy: 1,
      rawBarcode: "VC-MAP-01",
      barcodeFormat: "other",
      productId: 4,
      lot: "VCMAP2001",
      expiry: "2027-08-15",
      lotExpirySource: "manual",
      status: "used",
      qty: 1,
    },
  ]);

  await db.insert(stockEvents).values({
    eventType: "returned",
    productId: 4,
    locationId: 1,
    caseId: 1,
    lot: "VCMAP2001",
    expiry: "2027-08-15",
    qty: 1,
    byUserId: 1,
    at: "2026-02-01T10:05:00",
  });
  await audit({
    userId: 1,
    container: 1,
    entity: "stock_events",
    action: "seed_case_flow",
    detail: "Pulled 6 (5 planned + 1 gap), returned 1 mapping catheter",
  }, db);

  await db.insert(exceptions).values({
    id: 1,
    sourceContainer: 1,
    type: "taken_not_scanned_or_returned",
    productId: 1,
    status: "open",
    ownerUserId: 2,
    createdAt: "2026-02-01T10:35:00",
  });
  await audit({
    userId: 4,
    container: 1,
    entity: "exceptions",
    entityId: 1,
    action: "seed",
    detail: "Seeded gap: extra sheath pulled without close-out",
  }, db);

  console.log(`Seeded ${dbPath}`);
  console.log("Expected stockOnHand highlights:");
  console.log("  Terumo RSS802 lot 0001681425: arrived 3 - pulled 2 = 1");
  console.log(`  Terumo RSS802 lot EXPIRINGSOON1: arrived 1 = 1 (expires ${soonExpiryIso})`);
  console.log("  Cardiva 800-612C: arrived 2 - pulled 1 = 1");
  console.log("  Vendor C ablation: arrived 2 - pulled 1 = 1");
  console.log("  Vendor C mapping: arrived 3 - pulled 2 + returned 1 = 2");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
