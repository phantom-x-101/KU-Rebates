/**
 * Demo seed for the rebate consignment prototype.
 * Always resets to a clean demo state (deletes the SQLite file first).
 * Invented lots, quantities, par levels and dates are marked as demo data.
 * No patient identifiers. No write-back to Epic/GE/Workday.
 *
 * History uses only the real products (see db/demo-story.ts).
 * Dates are offsets from today UTC, so every reset on the same day matches.
 */
import fs from "node:fs";
import path from "node:path";
import { createDb, type AppDb } from "../src/db";
import { audit } from "../src/lib/audit";
import {
  appSettings,
  departments,
  expiryRules,
  productAccess,
  productIdentifiers,
  products,
  procedureTypes,
  rooms,
  stockEvents,
  storageLocations,
  users,
  vendors,
} from "../src/db/schema";
import {
  CARDIVA_DEMO_SHEATH,
  CARDIVA_VASCADE,
  DECA_CABLE_PACK,
  IN_HOUSE_VENDOR_ID,
  NUVISION_DEMO_CATH,
  NUVISION_NAV,
  NUVISION_VENDOR_ID,
  SEED_PRODUCTS,
  TERUMO_11FR,
  TERUMO_8FR,
} from "../src/lib/real-products";
import { seedDemoStory } from "./demo-story";

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

function vendorUserId(vendorId: number) {
  if (vendorId === 1) return 5;
  if (vendorId === 2) return 6;
  if (vendorId === 3) return 7;
  return 2;
}

/** Insert the clean demo rows. Does not delete the database file. */
export async function seedDemo(db: AppDb) {
  await db.insert(vendors).values([
    { id: 1, name: "Terumo" },
    { id: 2, name: "Cardiva" },
    { id: NUVISION_VENDOR_ID, name: "NuVision" },
    { id: IN_HOUSE_VENDOR_ID, name: "In-house" },
  ]);
  await audit(
    {
      userId: null,
      container: 1,
      entity: "vendors",
      action: "seed",
      detail: "Terumo, Cardiva, NuVision, in-house (hospital-owned packs)",
    },
    db,
  );

  await db.insert(users).values([
    { id: 1, name: "Alex", email: "alex@ku.example", role: "tech", active: 1 },
    {
      id: 2,
      name: "Sam",
      email: "sam@ku.example",
      role: "supply_chain",
      active: 1,
    },
    {
      id: 5,
      name: "Terry Terumo",
      email: "terry@terumo.example",
      role: "vendor_rep",
      vendorId: 1,
      active: 1,
    },
    {
      id: 6,
      name: "Pat Cardiva",
      email: "pat@cardiva.example",
      role: "vendor_rep",
      vendorId: 2,
      active: 1,
    },
    {
      id: 7,
      name: "Nico NuVision",
      email: "nico@nuvision.example",
      role: "vendor_rep",
      vendorId: NUVISION_VENDOR_ID,
      active: 1,
    },
  ]);
  await audit(
    {
      userId: 2,
      container: 1,
      entity: "users",
      action: "seed",
      detail:
        "Alex (tech), Sam (supply chain), Terry Terumo, Pat Cardiva, Nico NuVision",
    },
    db,
  );

  await db.insert(departments).values([
    { id: 1, name: "EP lab", phase: "pilot" },
    { id: 2, name: "Cath lab", phase: "next" },
    { id: 3, name: "Ortho", phase: "later" },
  ]);
  await db.insert(rooms).values([
    { id: 1, departmentId: 1, name: "EP 1" },
    { id: 2, departmentId: 1, name: "EP 2" },
    { id: 3, departmentId: 2, name: "Cath 1" },
  ]);
  await db.insert(procedureTypes).values([
    { id: 1, departmentId: 1, name: "ablation" },
    { id: 2, departmentId: 1, name: "mapping" },
    { id: 3, departmentId: 1, name: "implant" },
  ]);
  await audit(
    {
      userId: 2,
      container: 1,
      entity: "departments",
      action: "seed",
      detail: "EP lab (pilot), Cath lab (next), Ortho (later)",
    },
    db,
  );

  await db.insert(products).values(
    SEED_PRODUCTS.map((item) => ({
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

  const identifiers: {
    id: number;
    productId: number;
    idType: "catalog" | "gtin" | "hibc";
    value: string;
  }[] = [
    { id: 1, productId: TERUMO_8FR.id, idType: "catalog", value: TERUMO_8FR.catalogNumber },
    { id: 2, productId: TERUMO_8FR.id, idType: "gtin", value: TERUMO_8FR.gtin! },
    { id: 3, productId: CARDIVA_VASCADE.id, idType: "catalog", value: CARDIVA_VASCADE.catalogNumber },
    { id: 4, productId: CARDIVA_VASCADE.id, idType: "hibc", value: CARDIVA_VASCADE.hibc! },
    { id: 5, productId: CARDIVA_VASCADE.id, idType: "hibc", value: CARDIVA_VASCADE.hibc!.slice(0, -1) },
    { id: 6, productId: CARDIVA_VASCADE.id, idType: "hibc", value: `${CARDIVA_VASCADE.hibc}0` },
    { id: 7, productId: TERUMO_11FR.id, idType: "catalog", value: TERUMO_11FR.catalogNumber },
    { id: 8, productId: TERUMO_11FR.id, idType: "gtin", value: TERUMO_11FR.gtin! },
    { id: 9, productId: NUVISION_NAV.id, idType: "catalog", value: NUVISION_NAV.catalogNumber },
    { id: 10, productId: NUVISION_NAV.id, idType: "gtin", value: NUVISION_NAV.gtin! },
    { id: 11, productId: DECA_CABLE_PACK.id, idType: "catalog", value: DECA_CABLE_PACK.catalogNumber },
    { id: 12, productId: CARDIVA_DEMO_SHEATH.id, idType: "catalog", value: CARDIVA_DEMO_SHEATH.catalogNumber },
    { id: 13, productId: NUVISION_DEMO_CATH.id, idType: "catalog", value: NUVISION_DEMO_CATH.catalogNumber },
  ];
  await db.insert(productIdentifiers).values(identifiers);
  await audit(
    {
      userId: 2,
      container: 1,
      entity: "products",
      action: "seed",
      detail: "RSS802, RSS106, 800-612C, FG12081, CB3410CT, plus Cardiva/NuVision demo SKUs",
    },
    db,
  );

  await db.insert(storageLocations).values([
    { id: 1, departmentId: 1, name: "EP shelf", storageType: "shelf" },
  ]);
  await db.insert(productAccess).values(
    SEED_PRODUCTS.map((item) => ({
      productId: item.id,
      departmentId: 1,
      accessMode: "on_shelf" as const,
      locationId: 1,
      parLevel: item.parLevel,
    })),
  );
  await db.insert(expiryRules).values([
    { id: 1, vendorId: 1, daysBefore: 30, vendorPaysExpired: 1 },
    { id: 2, vendorId: 2, daysBefore: 30, vendorPaysExpired: 1 },
    { id: 3, vendorId: NUVISION_VENDOR_ID, daysBefore: 30, vendorPaysExpired: 1 },
  ]);

  await db.insert(appSettings).values([
    { key: "epic_integration", value: "off" },
    { key: "workday_integration", value: "off" },
    { key: "default_count_basis", value: "used" },
    { key: "default_forecast_method", value: "run_rate" },
    { key: "case_closeout_timeout_hours", value: "24" },
    { key: "datawedge_soft_trigger", value: "off" },
    { key: "scan_debug", value: "off" },
  ]);

  const soonExpiry = new Date();
  soonExpiry.setUTCDate(soonExpiry.getUTCDate() + 20);
  const soonExpiryIso = soonExpiry.toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  await db.insert(stockEvents).values(
    SEED_PRODUCTS.map((item, index) => ({
      eventType: "arrived" as const,
      productId: item.id,
      locationId: 1,
      lot: item.lot,
      expiry: item.expiry,
      qty: item.qty,
      byUserId: item.hospitalOwned ? 2 : vendorUserId(item.vendorId),
      at: `2026-01-10T10:0${index}:00`,
    })),
  );
  await audit(
    {
      userId: 2,
      container: 1,
      entity: "stock_events",
      action: "seed_arrived",
      detail: "Initial shelf stock for EP demo; hospital-owned DECA pack already on hand",
    },
    db,
  );

  await seedDemoStory(db, { todayIso, soonExpiryIso });

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
  console.log(`  Demo lots DEMO-EXPIRED / DEMO-SOON (expires ${soonExpiryIso}); today ${todayIso} has seeded use events.`);
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (entry.endsWith("db/seed.ts") || entry.endsWith("db/seed.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
