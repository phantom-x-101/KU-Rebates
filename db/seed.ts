/**
 * Demo seed for the rebate consignment prototype.
 * Always resets to a clean demo state (deletes the SQLite file first).
 * Placeholder vendors and invented quantities are marked as such.
 * No patient identifiers. No write-back to Epic/GE/Workday.
 *
 * The six-week history uses a fixed random seed (see db/demo-history.ts).
 * Dates are offsets from today UTC, so every reset on the same day matches.
 */
import fs from "node:fs";
import path from "node:path";
import { createDb, type AppDb } from "../src/db";
import { audit } from "../src/lib/audit";
import {
  appSettings,
  cases,
  departments,
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
import {
  CARDIVA_VASCADE,
  DECA_CABLE_PACK,
  IN_HOUSE_VENDOR_ID,
  NUVISION_NAV,
  NUVISION_VENDOR_ID,
  REAL_PRODUCTS,
  TERUMO_11FR,
  TERUMO_8FR,
} from "../src/lib/real-products";
import { seedLabHistory } from "./demo-history";

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

/** Insert the clean demo rows. Does not delete the database file. */
export async function seedDemo(db: AppDb) {
  // --- Vendors ---
  await db.insert(vendors).values([
    { id: 1, name: "Terumo" },
    { id: 2, name: "Cardiva" },
    { id: 3, name: "Vendor C" }, // placeholder
    { id: NUVISION_VENDOR_ID, name: "NuVision (manufacturer to confirm)" },
    { id: IN_HOUSE_VENDOR_ID, name: "In-house" },
  ]);
  await audit({
    userId: null,
    container: 1,
    entity: "vendors",
    action: "seed",
    detail: "Terumo, Cardiva, NuVision (manufacturer to confirm), in-house, Vendor C (placeholder)",
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
  // Real products from physical packages (prices are placeholders).
  await db.insert(products).values(
    REAL_PRODUCTS.map((item) => ({
      id: item.id,
      vendorId: item.vendorId,
      catalogNumber: item.catalogNumber,
      description: item.description,
      category: item.category,
      unitPrice: item.unitPrice,
      inItemMaster: 1,
      kuOwned: item.hospitalOwned ? 1 : 0,
    })),
  );
  await db.insert(products).values([
    {
      id: 3,
      vendorId: 3,
      catalogNumber: "VC-ABL-01",
      description: "Vendor C ablation catheter (placeholder)",
      category: "ablation catheter",
      unitPrice: 1680,
      inItemMaster: 0,
    },
    {
      id: 4,
      vendorId: 3,
      catalogNumber: "VC-MAP-01",
      description: "Vendor C mapping catheter (placeholder)",
      category: "mapping catheter",
      unitPrice: 920,
      inItemMaster: 1,
    },
  ]);
  await db.insert(productIdentifiers).values([
    { id: 1, productId: 1, idType: "catalog", value: TERUMO_8FR.catalogNumber },
    { id: 2, productId: 1, idType: "gtin", value: TERUMO_8FR.gtin! },
    { id: 3, productId: 2, idType: "catalog", value: CARDIVA_VASCADE.catalogNumber },
    { id: 4, productId: 2, idType: "hibc", value: CARDIVA_VASCADE.hibc! },
    { id: 5, productId: 3, idType: "catalog", value: "VC-ABL-01" },
    { id: 6, productId: 4, idType: "catalog", value: "VC-MAP-01" },
    // Placeholder GTINs so demo GS1 labels resolve lot and expiry.
    { id: 7, productId: 3, idType: "gtin", value: "00012345670001" },
    { id: 8, productId: 4, idType: "gtin", value: "00012345670002" },
    // Same Cardiva code if the last character on the label is the check letter O, not a zero.
    { id: 101, productId: 2, idType: "hibc", value: CARDIVA_VASCADE.hibc!.slice(0, -1) },
    // Photo reading with a trailing extra 0. Lookup also matches by prefix.
    { id: 107, productId: 2, idType: "hibc", value: `${CARDIVA_VASCADE.hibc}0` },
    { id: 102, productId: 25, idType: "catalog", value: TERUMO_11FR.catalogNumber },
    { id: 103, productId: 25, idType: "gtin", value: TERUMO_11FR.gtin! },
    { id: 104, productId: 26, idType: "catalog", value: NUVISION_NAV.catalogNumber },
    { id: 105, productId: 26, idType: "gtin", value: NUVISION_NAV.gtin! },
    { id: 106, productId: 27, idType: "catalog", value: DECA_CABLE_PACK.catalogNumber },
  ]);
  await audit({
    userId: 4,
    container: 1,
    entity: "products",
    action: "seed",
    detail: "RSS802, RSS106, 800-612C, FG12081, CB3410CT (hospital-owned), VC-ABL-01, VC-MAP-01",
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
      accessMode: "on_shelf",
      locationId: 1,
      parLevel: 1,
    },
    ...[TERUMO_11FR, NUVISION_NAV, DECA_CABLE_PACK].map((item) => ({
      productId: item.id,
      departmentId: 1,
      accessMode: "on_shelf" as const,
      locationId: 1,
      parLevel: item.parLevel,
    })),
  ]);
  await db.insert(expiryRules).values([
    { id: 1, vendorId: 1, daysBefore: 60, vendorPaysExpired: 1 },
    { id: 2, vendorId: 2, daysBefore: 60, vendorPaysExpired: 1 },
    { id: 3, vendorId: 3, daysBefore: 30, vendorPaysExpired: 1 },
    { id: 8, vendorId: NUVISION_VENDOR_ID, daysBefore: 60, vendorPaysExpired: 1 }, // placeholder terms
  ]);

  await db.insert(appSettings).values([
    { key: "epic_integration", value: "off" },
    { key: "workday_integration", value: "off" },
    { key: "default_count_basis", value: "used" },
    { key: "default_forecast_method", value: "run_rate" },
    { key: "case_closeout_timeout_hours", value: "24" },
  ]);

  // --- Stock arrivals (on hand before the case) ---
  // Real products: the lots printed on the physical packages.
  // Vendor C ablation: arrived 2. Vendor C mapping: arrived 3.
  // Placeholder mapping lots expiring within 30 days and already expired, so the
  // dashboard and exceptions pages have examples.
  const soonExpiry = new Date();
  soonExpiry.setUTCDate(soonExpiry.getUTCDate() + 20);
  const soonExpiryIso = soonExpiry.toISOString().slice(0, 10);

  await db.insert(stockEvents).values([
    ...REAL_PRODUCTS.map((item, index) => ({
      eventType: "arrived" as const,
      productId: item.id,
      locationId: 1,
      lot: item.lot,
      expiry: item.expiry,
      qty: item.qty,
      byUserId: 2,
      at: `2026-01-10T10:0${index}:00`,
    })),
    {
      eventType: "arrived",
      productId: 4,
      locationId: 1,
      lot: "EXPIRINGSOON1",
      expiry: soonExpiryIso,
      qty: 1,
      byUserId: 2,
      at: "2026-01-10T10:05:00",
    },
    {
      eventType: "arrived",
      productId: 4,
      locationId: 1,
      lot: "EXPIRED-SHELF",
      expiry: "2020-01-01",
      qty: 1,
      byUserId: 2,
      at: "2026-01-10T10:11:00",
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

  // --- EP case: 6 pulled, 1 returned. The 5 not returned count as used. ---
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
    detail: "Pulled 6, returned 1 mapping catheter; 5 not returned count as used",
  }, db);

  const todayIso = new Date().toISOString().slice(0, 10);
  await seedLabHistory(db, { todayIso });

  return { soonExpiryIso, todayIso };
}

async function main() {
  console.log(`Resetting clean demo state → ${dbPath}`);
  resetFile();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__kuDb = undefined;
  await pushSchema();
  const { db, sqlite } = createDb(dbPath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__kuDb = { db, sqlite };
  const { soonExpiryIso, todayIso } = await seedDemo(db);
  sqlite.close();
  console.log(`Seed complete (clean demo): ${dbPath}`);
  console.log(`  Terumo lot 0001681425 on hand 1; placeholder EXPIRINGSOON1 expires ${soonExpiryIso}`);
  console.log(`  Today ${todayIso} has no cases, so a live case can start from the station.`);
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (entry.endsWith("db/seed.ts") || entry.endsWith("db/seed.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
