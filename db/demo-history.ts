/**
 * Six weeks of EP-lab history.
 * The mix comes from mulberry32(20261110). Dates are offsets from today UTC,
 * so a reset on a given day always rebuilds the same shelf, and "today" stays empty.
 * Expiring lots are relative to that day so "within 30 days" stays true.
 */
import { audit } from "../src/lib/audit";
import { LIVE_LOTS, demoGtin } from "../src/lib/demo-gtin";
import { listReorderView } from "../src/lib/reorder";
import type { AppDb } from "../src/db";
import {
  cases,
  contractLineProducts,
  contractLines,
  contractTiers,
  contracts,
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
import {
  EXTRA_PRODUCTS,
  NO_CONTRACT_PRODUCT_ID,
  type CatalogItem,
} from "./demo-catalog";

const RNG_SEED = 20261110;
const LOW_STOCK_PRODUCT_ID = 11;
const CASE_COUNT = 40;
const GAP_INDEXES = new Set([4, 21]);
const ABORT_INDEXES = new Set([9, 30]);
const WASTE_INDEXES = new Set([2, 12, 18, 33]);
const FORCE_LOW_INDEXES = new Set([0, 1, 2, 3, 5, 6]);

type Lot = {
  productId: number;
  lot: string;
  expiry: string;
  qty: number;
  reserved: boolean;
  locationId: number;
};

type Line = {
  productId: number;
  vendorId: number;
  locationId: number;
  lot: string;
  expiry: string;
  catalog: string;
  locked: boolean;
  outside: boolean;
};

type StockRow = {
  eventType: "arrived" | "pulled" | "returned";
  productId: number;
  locationId: number;
  caseId?: number;
  lot: string;
  expiry: string;
  qty: number;
  byUserId: number;
  at: string;
};

type ScanRow = {
  id: number;
  caseId: number;
  scannedAt: string;
  scannedBy: number;
  rawBarcode: string;
  barcodeFormat: "gs1" | "hibc" | "other";
  productId: number;
  lot: string;
  expiry: string;
  lotExpirySource: "manual";
  status: "used" | "wasted" | "returned";
  qty: number;
};

type CaseRow = {
  id: number;
  departmentId: number;
  roomId: number;
  procedureTypeId: number;
  openedAt: string;
  closedAt: string;
  openedBy: number;
  status: "closed" | "aborted";
};

type ExcRow = {
  id: number;
  sourceContainer: 1;
  type: "taken_not_scanned_or_returned" | "opened_or_wasted" | "expired_on_shelf";
  scanId?: number;
  productId: number;
  status: "open";
  ownerUserId: number | null;
  createdAt: string;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T>(rng: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = rng() * total;
  for (let i = 0; i < items.length; i++) {
    cursor -= weights[i]!;
    if (cursor <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function stamp(day: Date, hour: number, minute: number): string {
  const next = new Date(day);
  next.setUTCHours(hour, minute, 0, 0);
  return next.toISOString().slice(0, 19);
}

function weekStart(today: Date, week: number): Date {
  return addDays(today, -42 + week * 7);
}

function weekOf(day: Date, today: Date): number {
  const age = Math.round((today.getTime() - day.getTime()) / 86400000);
  return Math.floor((42 - age) / 7);
}

type Sku = CatalogItem;

function pickerSkus(): Sku[] {
  const existing: Sku[] = [
    {
      id: 3,
      vendorId: 3,
      catalogNumber: "VC-ABL-01",
      description: "Vendor C ablation catheter (placeholder)",
      category: "ablation",
      unitPrice: 1680,
      accessMode: "brought_in_for_case",
      locationId: 1,
      parLevel: null,
      inItemMaster: 0,
      barcode: { type: "gtin" },
      weekly: 4,
      target: 0,
    },
    {
      id: 4,
      vendorId: 3,
      catalogNumber: "VC-MAP-01",
      description: "Vendor C mapping catheter (placeholder)",
      category: "mapping",
      unitPrice: 920,
      accessMode: "on_shelf",
      locationId: 1,
      parLevel: 1,
      inItemMaster: 1,
      barcode: { type: "gtin" },
      weekly: 3,
      target: LIVE_LOTS.mapExtra.qty,
    },
  ];
  return [...existing, ...EXTRA_PRODUCTS];
}

function weightFor(sku: Sku, procedure: string): number {
  if (sku.id === LOW_STOCK_PRODUCT_ID || sku.id === 24) return 0;
  if (sku.accessMode === "not_kept_in_stock") return 0;
  let weight = 1;
  if (sku.vendorId === 3) weight = 5;
  else if (sku.vendorId === 4) weight = 4;
  else if (sku.vendorId === 5) weight = 3;
  else if (sku.vendorId === 6) weight = 2;
  else if (sku.vendorId === 7) weight = procedure.includes("implant") ? 8 : 0.35;
  if (procedure.includes("ablation") && sku.category.includes("ablation")) weight *= 3;
  if (procedure.includes("diagnostic") && sku.category.includes("diagnostic")) weight *= 3;
  if (procedure.includes("flutter") && sku.category.includes("mapping")) weight *= 3;
  if (procedure.includes("implant") && sku.category.includes("implant")) weight *= 3;
  if (sku.category.includes("sheath")) weight *= 1.5;
  return weight;
}

const LOT_EXPIRY = ["2031-04-01", "2031-08-15", "2032-01-20"];

export async function seedLabHistory(db: AppDb, opts: { todayIso: string }) {
  await db.insert(vendors).values([
    { id: 4, name: "Vendor D" },
    { id: 5, name: "Vendor E" },
    { id: 6, name: "Vendor F" },
    { id: 7, name: "Vendor G" },
  ]);
  await db.insert(users).values([
    {
      id: 6,
      name: "Pat · Cardiva",
      email: "pat.rep@cardiva.example",
      role: "vendor_rep",
      vendorId: 2,
      active: 1,
    },
    {
      id: 7,
      name: "Chris · Vendor C",
      email: "chris.rep@vendor-c.example",
      role: "vendor_rep",
      vendorId: 3,
      active: 1,
    },
    {
      id: 8,
      name: "Drew · Vendor D",
      email: "drew.rep@vendor-d.example",
      role: "vendor_rep",
      vendorId: 4,
      active: 1,
    },
    {
      id: 9,
      name: "Emery · Vendor E",
      email: "emery.rep@vendor-e.example",
      role: "vendor_rep",
      vendorId: 5,
      active: 1,
    },
    {
      id: 10,
      name: "Fran · Vendor F",
      email: "fran.rep@vendor-f.example",
      role: "vendor_rep",
      vendorId: 6,
      active: 1,
    },
    {
      id: 11,
      name: "Glen · Vendor G",
      email: "glen.rep@vendor-g.example",
      role: "vendor_rep",
      vendorId: 7,
      active: 1,
    },
  ]);
  // Cath lab rooms exist for the case picker only; its workflow is a preview.
  await db.insert(rooms).values([
    { id: 2, departmentId: 1, name: "EP 2" },
    { id: 3, departmentId: 2, name: "Cath 1" },
    { id: 4, departmentId: 2, name: "Cath 2" },
  ]);
  await db.insert(procedureTypes).values([
    { id: 2, departmentId: 1, name: "diagnostic EP study" },
    { id: 3, departmentId: 1, name: "device implant" },
    { id: 4, departmentId: 1, name: "flutter ablation" },
    { id: 5, departmentId: 2, name: "diagnostic cath" },
    { id: 6, departmentId: 2, name: "PCI" },
  ]);
  await db.insert(storageLocations).values([
    { id: 2, departmentId: 1, name: "EP 2 shelf", storageType: "shelf" },
  ]);
  await db.insert(expiryRules).values([
    { id: 4, vendorId: 4, daysBefore: 45, vendorPaysExpired: 1 },
    { id: 5, vendorId: 5, daysBefore: 60, vendorPaysExpired: 1 },
    { id: 6, vendorId: 6, daysBefore: 30, vendorPaysExpired: 1 },
    { id: 7, vendorId: 7, daysBefore: 90, vendorPaysExpired: 0 },
  ]);

  await db.insert(products).values(
    EXTRA_PRODUCTS.map((item) => ({
      id: item.id,
      vendorId: item.vendorId,
      catalogNumber: item.catalogNumber,
      description: item.description,
      category: item.category,
      unitPrice: item.unitPrice,
      inItemMaster: item.inItemMaster,
    })),
  );

  let nextIdentifier = 9;
  await db.insert(productIdentifiers).values(
    EXTRA_PRODUCTS.flatMap((item) => {
      const rows: (typeof productIdentifiers.$inferInsert)[] = [
        {
          id: nextIdentifier++,
          productId: item.id,
          idType: "catalog" as const,
          value: item.catalogNumber,
        },
      ];
      if (item.barcode.type === "gtin") {
        rows.push({
          id: nextIdentifier++,
          productId: item.id,
          idType: "gtin" as const,
          value: demoGtin(item.id),
        });
      } else {
        rows.push({
          id: nextIdentifier++,
          productId: item.id,
          idType: "hibc" as const,
          value: item.barcode.value,
        });
      }
      return rows;
    }),
  );

  await db.insert(productAccess).values(
    EXTRA_PRODUCTS.map((item) => ({
      productId: item.id,
      departmentId: 1,
      accessMode: item.accessMode,
      locationId: item.locationId,
      parLevel: item.parLevel,
    })),
  );

  const vendorRows = [
    { id: 1, name: "Terumo" },
    { id: 2, name: "Cardiva" },
    { id: 3, name: "Vendor C" },
    { id: 4, name: "Vendor D" },
    { id: 5, name: "Vendor E" },
    { id: 6, name: "Vendor F" },
    { id: 7, name: "Vendor G" },
  ];
  await db.insert(contracts).values(
    vendorRows.map((vendor) => ({
      id: vendor.id,
      vendorId: vendor.id,
      name:
        vendor.id <= 2
          ? `${vendor.name} placeholder terms (demo)`
          : `${vendor.name} placeholder agreement`,
      externalId: `DEMO-${vendor.id}`,
      contractType: "direct" as const,
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      periodType: "quarter" as const,
      countBasis: "used" as const,
      allLinesRequired: 1,
      forecastMethod: "run_rate" as const,
      status: "active" as const,
    })),
  );
  await db.insert(contractLines).values(
    vendorRows.map((vendor) => ({
      id: vendor.id,
      contractId: vendor.id,
      name: "Placeholder unit commitment (demo)",
      metric: "units" as const,
      requiredQty: 100,
      unitPrice: null,
    })),
  );
  const contracted = [
    { id: 1, vendorId: 1 },
    { id: 2, vendorId: 2 },
    { id: 3, vendorId: 3 },
    { id: 4, vendorId: 3 },
    ...EXTRA_PRODUCTS.filter((item) => item.id !== NO_CONTRACT_PRODUCT_ID).map(
      (item) => ({ id: item.id, vendorId: item.vendorId }),
    ),
  ];
  await db.insert(contractLineProducts).values(
    contracted.map((item) => ({
      contractLineId: item.vendorId,
      productId: item.id,
      countMultiplier: 1,
    })),
  );
  await db.insert(contractTiers).values(
    vendorRows.flatMap((vendor) => [
      {
        id: vendor.id * 2 - 1,
        contractId: vendor.id,
        tierLevel: 1,
        thresholdNote: "Placeholder tier (demo)",
        rebateType: "percent" as const,
        rebateValue: 2,
      },
      {
        id: vendor.id * 2,
        contractId: vendor.id,
        tierLevel: 2,
        thresholdNote: "Placeholder tier (demo)",
        rebateType: "percent" as const,
        rebateValue: 4,
      },
    ]),
  );

  const today = utcToday();
  const skus = pickerSkus();
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const lots: Lot[] = [];
  const arrivals: StockRow[] = [];
  const pulls: StockRow[] = [];
  const caseRows: CaseRow[] = [];
  const scanRows: ScanRow[] = [];
  const excRows: ExcRow[] = [];
  const gapAudits: { id: number; caseId: number; productId: number }[] = [];
  let nextScan = 5;
  let nextExc = 2;

  function addLot(
    productId: number,
    lot: string,
    expiry: string,
    qty: number,
    reserved: boolean,
    at: string,
  ) {
    const sku = skuById.get(productId);
    if (!sku) throw new Error(`Unknown product ${productId}`);
    const found = lots.find(
      (row) =>
        row.productId === productId && row.lot === lot && row.expiry === expiry,
    );
    if (found) found.qty += qty;
    else {
      lots.push({
        productId,
        lot,
        expiry,
        qty,
        reserved,
        locationId: sku.locationId,
      });
    }
    arrivals.push({
      eventType: "arrived",
      productId,
      locationId: sku.locationId,
      lot,
      expiry,
      qty,
      byUserId: 2,
      at,
    });
  }

  function totalQty(productId: number) {
    return lots
      .filter((row) => row.productId === productId)
      .reduce((sum, row) => sum + row.qty, 0);
  }

  function spare(productId: number) {
    const sku = skuById.get(productId);
    if (!sku) return 0;
    return totalQty(productId) - sku.target;
  }

  function takeOne(productId: number, locked: boolean): Line {
    const sku = skuById.get(productId);
    if (!sku) throw new Error(`Unknown product ${productId}`);
    if (spare(productId) <= 0) {
      throw new Error(`No spare stock for ${sku.catalogNumber}`);
    }
    const choices = lots
      .filter((row) => row.productId === productId && !row.reserved && row.qty > 0)
      .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.lot.localeCompare(b.lot));
    const lot = choices[0];
    if (!lot) throw new Error(`No pullable lot for ${sku.catalogNumber}`);
    lot.qty -= 1;
    return {
      productId,
      vendorId: sku.vendorId,
      locationId: lot.locationId,
      lot: lot.lot,
      expiry: lot.expiry,
      catalog: sku.catalogNumber,
      locked,
      outside: false,
    };
  }

  function restore(line: Line) {
    if (line.outside) return;
    const lot = lots.find(
      (row) =>
        row.productId === line.productId &&
        row.lot === line.lot &&
        row.expiry === line.expiry,
    );
    if (!lot) throw new Error(`Cannot restore ${line.catalog} ${line.lot}`);
    lot.qty += 1;
  }

  const rng = mulberry32(RNG_SEED);
  const procedures = [
    { id: 1, name: "ablation" },
    { id: 2, name: "diagnostic EP study" },
    { id: 4, name: "flutter ablation" },
    { id: 1, name: "ablation" },
    { id: 3, name: "device implant" },
  ];

  const weekdays: Date[] = [];
  for (let age = 42; age >= 1; age--) {
    const day = addDays(today, -age);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    weekdays.push(day);
  }
  const slots: { day: Date; hour: number }[] = [];
  for (let i = 0; i < weekdays.length && slots.length < CASE_COUNT; i++) {
    slots.push({ day: weekdays[i]!, hour: 8 });
    if (slots.length < CASE_COUNT && i < 10) {
      slots.push({ day: weekdays[i]!, hour: 13 });
    }
  }
  if (slots.length !== CASE_COUNT) {
    throw new Error(`Expected ${CASE_COUNT} case slots, got ${slots.length}`);
  }

  function pickOne(procedure: string, used: Set<number>, at: string): Line {
    const pool = () =>
      skus.filter(
        (sku) => !used.has(sku.id) && spare(sku.id) > 0 && weightFor(sku, procedure) > 0,
      );
    let choices = pool();
    if (choices.length === 0) {
      const donor = skus.find(
        (sku) =>
          !used.has(sku.id) &&
          sku.id !== LOW_STOCK_PRODUCT_ID &&
          sku.id !== 24 &&
          sku.weekly > 0,
      );
      if (!donor) throw new Error("No product left to fill a case");
      addLot(donor.id, `${donor.catalogNumber}-X`, "2031-06-01", 1, false, at);
      choices = pool();
    }
    const sku = weightedPick(
      rng,
      choices,
      choices.map((item) => weightFor(item, procedure)),
    );
    return takeOne(sku.id, false);
  }

  function retarget(
    lines: Line[],
    vendorId: number,
    at: string,
  ): Line | null {
    const already = lines.find((line) => line.vendorId === vendorId && !line.outside);
    if (already) return already;
    const idx = lines.findIndex((line) => !line.locked && !line.outside);
    if (idx < 0) return null;
    const removed = lines[idx]!;
    restore(removed);
    const used = new Set(
      lines.filter((_, lineIndex) => lineIndex !== idx).map((line) => line.productId),
    );
    const donor = skus.find(
      (sku) =>
        sku.vendorId === vendorId &&
        !used.has(sku.id) &&
        sku.id !== LOW_STOCK_PRODUCT_ID &&
        sku.id !== 24,
    );
    if (!donor) {
      lines[idx] = takeOne(removed.productId, removed.locked);
      return null;
    }
    if (spare(donor.id) <= 0) {
      addLot(donor.id, `${donor.catalogNumber}-X`, "2031-06-01", 1, false, at);
    }
    const line = takeOne(donor.id, false);
    lines[idx] = line;
    return line;
  }

  for (let week = 0; week < 6; week++) {
    const at = stamp(weekStart(today, week), 6, week);
    for (const sku of skus) {
      if (sku.weekly <= 0) continue;
      const slot = week % 3;
      addLot(
        sku.id,
        `${sku.catalogNumber}-W${slot}`,
        LOT_EXPIRY[slot]!,
        sku.weekly,
        false,
        at,
      );
    }
    const weekSlots = slots
      .map((slot, index) => ({ ...slot, index }))
      .filter((slot) => weekOf(slot.day, today) === week);

    if (week === 0) {
      const early = stamp(weekStart(today, 0), 6, 10);
      addLot(LOW_STOCK_PRODUCT_ID, "VDSH08-A", "2031-02-01", 4, false, early);
      addLot(LOW_STOCK_PRODUCT_ID, "VDSH08-B", "2031-11-01", 4, false, early);
      addLot(
        LIVE_LOTS.sheath.productId,
        LIVE_LOTS.sheath.lot,
        LIVE_LOTS.sheath.expiry,
        LIVE_LOTS.sheath.qty,
        true,
        early,
      );
      addLot(
        LIVE_LOTS.map.productId,
        LIVE_LOTS.map.lot,
        LIVE_LOTS.map.expiry,
        LIVE_LOTS.map.qty,
        true,
        early,
      );
      addLot(
        LIVE_LOTS.wire.productId,
        LIVE_LOTS.wire.lot,
        LIVE_LOTS.wire.expiry,
        LIVE_LOTS.wire.qty,
        true,
        early,
      );
      addLot(
        LIVE_LOTS.hibcWire.productId,
        LIVE_LOTS.hibcWire.lot,
        LIVE_LOTS.hibcWire.expiry,
        LIVE_LOTS.hibcWire.qty,
        true,
        early,
      );
      addLot(
        LIVE_LOTS.implant.productId,
        LIVE_LOTS.implant.lot,
        LIVE_LOTS.implant.expiry,
        LIVE_LOTS.implant.qty,
        true,
        early,
      );
      addLot(
        LIVE_LOTS.expired.productId,
        LIVE_LOTS.expired.lot,
        LIVE_LOTS.expired.expiry,
        LIVE_LOTS.expired.qty,
        true,
        early,
      );
      addLot(
        LIVE_LOTS.mapExtra.productId,
        LIVE_LOTS.mapExtra.lot,
        LIVE_LOTS.mapExtra.expiry,
        LIVE_LOTS.mapExtra.qty,
        true,
        early,
      );
      addLot(9, "VD-SOON", isoDate(addDays(today, 12)), 1, true, early);
      addLot(17, "VF-SOON", isoDate(addDays(today, 28)), 1, true, early);
    }

    for (const slot of weekSlots) {
      const procedure = procedures[slot.index % procedures.length]!;
      const count = 5 + (slot.index % 4);
      const lines: Line[] = [];
      const used = new Set<number>();
      const arriveAt = stamp(slot.day, slot.hour - 1, 0);

      if (FORCE_LOW_INDEXES.has(slot.index)) {
        const line = takeOne(LOW_STOCK_PRODUCT_ID, true);
        lines.push(line);
        used.add(line.productId);
      }
      if (slot.index === 0) {
        lines.push({
          productId: 4,
          vendorId: 3,
          locationId: 1,
          lot: "VCMAP2001",
          expiry: "2027-08-15",
          catalog: "VC-MAP-01",
          locked: true,
          outside: true,
        });
        used.add(4);
      }
      while (lines.length < count) {
        const line = pickOne(procedure.name, used, arriveAt);
        lines.push(line);
        used.add(line.productId);
      }

      const openedAt = stamp(slot.day, slot.hour, 0);
      const closedAt = stamp(slot.day, slot.hour + 2, 30);
      if (openedAt.slice(0, 10) === opts.todayIso) {
        throw new Error("History case landed on today");
      }

      if (WASTE_INDEXES.has(slot.index)) {
        retarget(lines, 5, arriveAt);
      } else if (GAP_INDEXES.has(slot.index)) {
        // Keep products 1 and 3 free of extra gaps. Tests close a new
        // product-3 gap and expect that to be the only open one.
        retarget(lines, slot.index === 4 ? 4 : 5, arriveAt);
      }

      const caseId = slot.index + 2;
      const aborted = ABORT_INDEXES.has(slot.index);
      caseRows.push({
        id: caseId,
        departmentId: 1,
        roomId: slot.index % 2 === 0 ? 1 : 2,
        procedureTypeId: procedure.id,
        openedAt,
        closedAt,
        openedBy: 1,
        status: aborted ? "aborted" : "closed",
      });

      const wasteLine = WASTE_INDEXES.has(slot.index)
        ? lines.find((line) => line.vendorId === 5 && !line.locked) ??
          lines.find((line) => !line.locked && !line.outside) ??
          null
        : null;
      const gapLine = GAP_INDEXES.has(slot.index)
        ? lines.find(
            (line) =>
              !line.locked &&
              !line.outside &&
              line.productId !== 1 &&
              line.productId !== 3,
          ) ??
          lines.find((line) => !line.locked && !line.outside) ??
          null
        : null;
      const returnLine =
        !aborted &&
        !wasteLine &&
        !gapLine &&
        slot.index % 7 === 0
          ? lines.find((line) => !line.locked && !line.outside) ?? null
          : null;

      lines.forEach((line, lineIndex) => {
        const at = stamp(slot.day, slot.hour, 15 + lineIndex);
        pulls.push({
          eventType: "pulled",
          productId: line.productId,
          locationId: line.locationId,
          caseId,
          lot: line.lot,
          expiry: line.expiry,
          qty: 1,
          byUserId: 1,
          at,
        });

        if (aborted) {
          restore(line);
          pulls.push({
            eventType: "returned",
            productId: line.productId,
            locationId: line.locationId,
            caseId,
            lot: line.lot,
            expiry: line.expiry,
            qty: 1,
            byUserId: 1,
            at: closedAt,
          });
          return;
        }

        if (gapLine && line === gapLine) return;

        if (returnLine && line === returnLine) {
          restore(line);
          pulls.push({
            eventType: "returned",
            productId: line.productId,
            locationId: line.locationId,
            caseId,
            lot: line.lot,
            expiry: line.expiry,
            qty: 1,
            byUserId: 1,
            at: closedAt,
          });
          return;
        }

        const wasted = wasteLine === line;
        const scanId = nextScan++;
        scanRows.push({
          id: scanId,
          caseId,
          scannedAt: closedAt,
          scannedBy: 1,
          rawBarcode: line.catalog,
          barcodeFormat: "other",
          productId: line.productId,
          lot: line.lot,
          expiry: line.expiry,
          lotExpirySource: "manual",
          status: wasted ? "wasted" : "used",
          qty: 1,
        });
        if (wasted) {
          excRows.push({
            id: nextExc++,
            sourceContainer: 1,
            type: "opened_or_wasted",
            scanId,
            productId: line.productId,
            status: "open",
            ownerUserId: 2,
            createdAt: closedAt,
          });
        }
      });

      if (gapLine) {
        const excId = nextExc++;
        excRows.push({
          id: excId,
          sourceContainer: 1,
          type: "taken_not_scanned_or_returned",
          productId: gapLine.productId,
          status: "open",
          ownerUserId: 2,
          createdAt: closedAt,
        });
        gapAudits.push({
          id: excId,
          caseId,
          productId: gapLine.productId,
        });
      }
    }
  }

  if (totalQty(LOW_STOCK_PRODUCT_ID) !== 2) {
    throw new Error(
      `Low-stock sheath ended at ${totalQty(LOW_STOCK_PRODUCT_ID)}, expected 2`,
    );
  }
  if (lots.some((lot) => lot.qty < 0)) {
    throw new Error("A lot went negative");
  }
  const wasted = excRows.filter((row) => row.type === "opened_or_wasted").length;
  const gaps = excRows.filter(
    (row) => row.type === "taken_not_scanned_or_returned",
  ).length;
  if (wasted !== 4) throw new Error(`Expected 4 wasted items, got ${wasted}`);
  if (gaps !== 2) throw new Error(`Expected 2 new gap cases, got ${gaps}`);

  excRows.push(
    {
      id: nextExc++,
      sourceContainer: 1,
      type: "expired_on_shelf",
      productId: 2,
      status: "open",
      ownerUserId: null,
      createdAt: stamp(addDays(today, -2), 7, 0),
    },
    {
      id: nextExc++,
      sourceContainer: 1,
      type: "expired_on_shelf",
      productId: LIVE_LOTS.expired.productId,
      status: "open",
      ownerUserId: null,
      createdAt: stamp(addDays(today, -2), 7, 5),
    },
  );

  await insertChunks(arrivals, (slice) => db.insert(stockEvents).values(slice));
  await insertChunks(caseRows, (slice) => db.insert(cases).values(slice));
  await insertChunks(pulls, (slice) => db.insert(stockEvents).values(slice));
  await insertChunks(scanRows, (slice) => db.insert(scans).values(slice));
  await insertChunks(excRows, (slice) => db.insert(exceptions).values(slice));

  await audit(
    {
      userId: 4,
      container: 1,
      entity: "products",
      action: "seed",
      detail: "Placeholder vendors D–G and 20 demo products. Not real vendor products.",
    },
    db,
  );
  for (const caseRow of caseRows) {
    await audit(
      {
        userId: 1,
        container: 2,
        entity: "cases",
        entityId: caseRow.id,
        action: caseRow.status === "aborted" ? "seed_aborted" : "seed_close",
        detail: `case=${caseRow.id} status=${caseRow.status}`,
      },
      db,
    );
  }
  for (const gap of gapAudits) {
    await audit(
      {
        userId: 4,
        container: 1,
        entity: "exceptions",
        entityId: gap.id,
        action: "seed",
        detail: `case=${gap.caseId} product=${gap.productId} gap=1 Historical item left open`,
      },
      db,
    );
  }

  await printSummary(db, opts.todayIso);
}

async function insertChunks<T extends Record<string, unknown>>(
  rows: T[],
  write: (slice: T[]) => Promise<unknown>,
) {
  const size = 40;
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    if (slice.length > 0) await write(slice);
  }
}

async function printSummary(db: AppDb, todayIso: string) {
  const productRows = await db.select({ id: products.id }).from(products);
  const lotRows = await db
    .select({ productId: stockEvents.productId, lot: stockEvents.lot })
    .from(stockEvents);
  const lotCount = new Set(
    lotRows.map((row) => `${row.productId}|${row.lot ?? ""}`),
  ).size;
  const caseRows = await db
    .select({ id: cases.id, openedAt: cases.openedAt })
    .from(cases);
  const excRows = await db.select({ type: exceptions.type }).from(exceptions);
  const byType = new Map<string, number>();
  for (const row of excRows) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  }
  const low = (await listReorderView(db)).filter((row) => row.lowStock);
  const todayCases = caseRows.filter((row) => row.openedAt.startsWith(todayIso));
  const exceptionText = [...byType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");
  const lowText = low
    .map((row) => `${row.catalogNumber} (${row.onHand}/${row.parLevel})`)
    .join(", ");

  console.log("Demo seed summary");
  console.log(`  products: ${productRows.length}`);
  console.log(`  lots: ${lotCount}`);
  console.log(`  cases: ${caseRows.length}`);
  console.log(`  exceptions: ${exceptionText}`);
  console.log(`  low stock: ${lowText || "none"}`);
  console.log(`  cases opened today: ${todayCases.length}`);
}
