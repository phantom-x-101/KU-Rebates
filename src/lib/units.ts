import { desc, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  products,
  stockEvents,
  storageLocations,
  units,
  users,
  vendors,
  type UnitStatus,
} from "@/db/schema";
import { identifyProduct } from "@/lib/arrival";
import { audit } from "@/lib/audit";
import {
  describeScan,
  isLotExpiryOnly,
  pairLotScan,
  parseBarcode,
} from "@/lib/barcode";
import { getCase } from "@/lib/cases";
import { nowEventAt } from "@/lib/event-time";
import {
  flagNotOnAnyContract,
  recordExpiredUnit,
  recordRejectedArrival,
  recordUnknownTag,
  recordUnmappedBarcode,
} from "@/lib/exceptions";
import {
  formatTag,
  normalizeTag,
  tagRejectMessage,
  tagRejectReason,
} from "@/lib/tag";

export type TaggedUnit = {
  id: number;
  tagEpc: string;
  tagDisplay: string;
  productId: number;
  vendorId: number;
  lot: string;
  expiry: string;
  status: UnitStatus;
  checkedInAt: string;
  checkedInBy: number | null;
  caseId: number | null;
  checkedOutAt: string | null;
  catalogNumber: string;
  description: string;
  vendorName: string;
  hospitalOwned: boolean;
};

export type UnitOnHandRow = {
  productId: number;
  lot: string;
  expiry: string;
  onHand: number;
};

function asTaggedUnit(row: {
  id: number;
  tagEpc: string;
  productId: number;
  vendorId: number;
  lot: string;
  expiry: string;
  status: string;
  checkedInAt: string;
  checkedInBy: number | null;
  caseId: number | null;
  checkedOutAt: string | null;
  catalogNumber: string;
  description: string;
  vendorName: string;
  kuOwned: number;
}): TaggedUnit {
  return {
    id: row.id,
    tagEpc: row.tagEpc,
    tagDisplay: formatTag(row.tagEpc),
    productId: row.productId,
    vendorId: row.vendorId,
    lot: row.lot,
    expiry: row.expiry,
    status: row.status as UnitStatus,
    checkedInAt: row.checkedInAt,
    checkedInBy: row.checkedInBy,
    caseId: row.caseId,
    checkedOutAt: row.checkedOutAt,
    catalogNumber: row.catalogNumber,
    description: row.description,
    vendorName: row.vendorName,
    hospitalOwned: row.kuOwned === 1,
  };
}

export async function findUnitByTag(raw: string, db: AppDb = getDb()) {
  const tagEpc = normalizeTag(raw);
  if (!tagEpc) return null;
  return loadUnitByEpc(tagEpc, db);
}

async function loadUnitByEpc(tagEpc: string, db: AppDb) {
  const [row] = await db
    .select({
      id: units.id,
      tagEpc: units.tagEpc,
      productId: units.productId,
      vendorId: units.vendorId,
      lot: units.lot,
      expiry: units.expiry,
      status: units.status,
      checkedInAt: units.checkedInAt,
      checkedInBy: units.checkedInBy,
      caseId: units.caseId,
      checkedOutAt: units.checkedOutAt,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorName: vendors.name,
      kuOwned: products.kuOwned,
    })
    .from(units)
    .innerJoin(products, eq(units.productId, products.id))
    .innerJoin(vendors, eq(units.vendorId, vendors.id))
    .where(eq(units.tagEpc, tagEpc))
    .limit(1);
  return row ? asTaggedUnit(row) : null;
}

async function shelfLocationId(db: AppDb) {
  const [shelf] = await db
    .select()
    .from(storageLocations)
    .where(eq(storageLocations.name, "EP shelf"))
    .limit(1);
  if (shelf) return shelf.id;
  const [anyLoc] = await db.select().from(storageLocations).limit(1);
  return anyLoc?.id ?? null;
}

function isExpired(expiry: string, today: Date = new Date()) {
  return expiry < today.toISOString().slice(0, 10);
}

export type CheckInFailure =
  | "invalid_tag"
  | "tag_in_use"
  | "wrong_vendor"
  | "hospital_owned"
  | "expired"
  | "role"
  | "unknown_product";

export type CheckInResult =
  | { ok: true; unit: TaggedUnit }
  | { ok: false; code: CheckInFailure; message: string };

/**
 * Vendor links one tag to one unit of their own product.
 * Writes units + stock_events.arrived + audit_log.
 */
export async function checkInUnit(
  input: {
    tagRaw: string;
    productId: number;
    lot: string;
    expiry: string;
    locationId?: number | null;
  },
  userId: number,
  db: AppDb = getDb(),
): Promise<CheckInResult> {
  const reject = tagRejectReason(input.tagRaw);
  if (reject) {
    return {
      ok: false,
      code: "invalid_tag",
      message: tagRejectMessage(reject),
    };
  }
  const tagEpc = normalizeTag(input.tagRaw)!;

  const [actor] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!actor || !actor.active || actor.role !== "vendor_rep" || actor.vendorId == null) {
    return {
      ok: false,
      code: "role",
      message: "Only a vendor rep can check in tagged units.",
    };
  }

  const [product] = await db
    .select({
      id: products.id,
      vendorId: products.vendorId,
      catalogNumber: products.catalogNumber,
      description: products.description,
      kuOwned: products.kuOwned,
      vendorName: vendors.name,
    })
    .from(products)
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!product) {
    return { ok: false, code: "unknown_product", message: "Product not found." };
  }
  if (product.kuOwned === 1) {
    return {
      ok: false,
      code: "hospital_owned",
      message: `${product.description} is hospital-owned. Vendors cannot check it in.`,
    };
  }
  if (product.vendorId !== actor.vendorId) {
    return {
      ok: false,
      code: "wrong_vendor",
      message: `${product.description} belongs to ${product.vendorName}. You can only check in your own products.`,
    };
  }
  if (isExpired(input.expiry)) {
    return {
      ok: false,
      code: "expired",
      message: `Expired item — not accepted (expiry ${input.expiry})`,
    };
  }

  const existing = await loadUnitByEpc(tagEpc, db);
  if (existing) {
    return {
      ok: false,
      code: "tag_in_use",
      message: `Tag ${formatTag(tagEpc)} is already linked to ${existing.description}.`,
    };
  }

  const at = nowEventAt();
  const locationId = input.locationId ?? (await shelfLocationId(db));
  const [row] = await db
    .insert(units)
    .values({
      tagEpc,
      productId: product.id,
      vendorId: product.vendorId,
      lot: input.lot,
      expiry: input.expiry,
      status: "in_stock",
      checkedInAt: at,
      checkedInBy: userId,
      caseId: null,
      checkedOutAt: null,
    })
    .returning();

  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "arrived",
      productId: product.id,
      locationId,
      lot: input.lot,
      expiry: input.expiry,
      qty: 1,
      at,
      byUserId: userId,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "units",
      entityId: row.id,
      action: "check_in",
      detail: `tag=${tagEpc} product=${product.id} lot=${input.lot} expiry=${input.expiry} event=${event.id}`,
    },
    db,
  );

  const unit = await loadUnitByEpc(tagEpc, db);
  return { ok: true, unit: unit! };
}

export type TagScanFailure =
  | "invalid_tag"
  | "unknown_tag"
  | "expired"
  | "no_case"
  | "role"
  | "duplicate";

export type TagScanResult =
  | { ok: true; action: "checked_out" | "returned"; unit: TaggedUnit }
  | { ok: false; code: TagScanFailure; message: string; unit: TaggedUnit | null };

/**
 * Tech: in-stock tag → check out (KU pays). Checked-out tag → return.
 */
export async function applyTagScan(
  input: { tagRaw: string; caseId: number | null },
  userId: number,
  db: AppDb = getDb(),
): Promise<TagScanResult> {
  const reject = tagRejectReason(input.tagRaw);
  if (reject) {
    return {
      ok: false,
      code: "invalid_tag",
      message: tagRejectMessage(reject),
      unit: null,
    };
  }
  const tagEpc = normalizeTag(input.tagRaw)!;

  const [actor] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!actor || !actor.active || actor.role !== "tech") {
    return {
      ok: false,
      code: "role",
      message: "Only a tech can check tagged units out or return them.",
      unit: null,
    };
  }

  const unit = await loadUnitByEpc(tagEpc, db);
  if (!unit) {
    await recordUnknownTag(tagEpc, userId, db);
    return {
      ok: false,
      code: "unknown_tag",
      message: `Unknown tag ${formatTag(tagEpc)}. Nothing was checked out.`,
      unit: null,
    };
  }

  if (unit.status === "expired" || isExpired(unit.expiry)) {
    if (unit.status !== "expired") {
      await db
        .update(units)
        .set({ status: "expired", caseId: null, checkedOutAt: null })
        .where(eq(units.id, unit.id));
    }
    await recordExpiredUnit(
      { productId: unit.productId, tagEpc, expiry: unit.expiry },
      userId,
      db,
    );
    return {
      ok: false,
      code: "expired",
      message: `Expired unit — checkout blocked (expiry ${unit.expiry})`,
      unit: { ...unit, status: "expired" },
    };
  }

  if (unit.status === "checked_out") {
    return returnTaggedUnit(unit, userId, db);
  }

  if (!input.caseId) {
    return {
      ok: false,
      code: "no_case",
      message: "Open a case first",
      unit,
    };
  }
  const caseRow = await getCase(input.caseId, db);
  if (!caseRow || caseRow.status !== "open") {
    return {
      ok: false,
      code: "no_case",
      message: caseRow ? "Case is not open" : "Case not found",
      unit,
    };
  }

  return checkOutUnit(unit, input.caseId, userId, db);
}

async function checkOutUnit(
  unit: TaggedUnit,
  caseId: number,
  userId: number,
  db: AppDb,
): Promise<TagScanResult> {
  const at = nowEventAt();
  const locationId = await shelfLocationId(db);
  await db
    .update(units)
    .set({ status: "checked_out", caseId, checkedOutAt: at })
    .where(eq(units.id, unit.id));

  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "pulled",
      productId: unit.productId,
      locationId,
      caseId,
      lot: unit.lot,
      expiry: unit.expiry,
      qty: 1,
      at,
      byUserId: userId,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "units",
      entityId: unit.id,
      action: "check_out",
      detail: `tag=${unit.tagEpc} case=${caseId} event=${event.id}`,
    },
    db,
  );
  await flagNotOnAnyContract(unit.productId, "use", userId, db);

  const updated = await loadUnitByEpc(unit.tagEpc, db);
  return { ok: true, action: "checked_out", unit: updated! };
}

async function returnTaggedUnit(
  unit: TaggedUnit,
  userId: number,
  db: AppDb,
): Promise<TagScanResult> {
  const at = nowEventAt();
  const locationId = await shelfLocationId(db);
  const returnCaseId = unit.caseId;
  await db
    .update(units)
    .set({ status: "in_stock", caseId: null, checkedOutAt: null })
    .where(eq(units.id, unit.id));

  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "returned",
      productId: unit.productId,
      locationId,
      caseId: returnCaseId,
      lot: unit.lot,
      expiry: unit.expiry,
      qty: 1,
      at,
      byUserId: userId,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "units",
      entityId: unit.id,
      action: "return",
      detail: `tag=${unit.tagEpc} case=${returnCaseId ?? ""} event=${event.id}`,
    },
    db,
  );

  const updated = await loadUnitByEpc(unit.tagEpc, db);
  return { ok: true, action: "returned", unit: updated! };
}

/** Own-vendor units only. Never trusts a client-supplied other vendorId. */
export async function listVendorUnits(
  vendorId: number,
  db: AppDb = getDb(),
): Promise<TaggedUnit[]> {
  const rows = await db
    .select({
      id: units.id,
      tagEpc: units.tagEpc,
      productId: units.productId,
      vendorId: units.vendorId,
      lot: units.lot,
      expiry: units.expiry,
      status: units.status,
      checkedInAt: units.checkedInAt,
      checkedInBy: units.checkedInBy,
      caseId: units.caseId,
      checkedOutAt: units.checkedOutAt,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorName: vendors.name,
      kuOwned: products.kuOwned,
    })
    .from(units)
    .innerJoin(products, eq(units.productId, products.id))
    .innerJoin(vendors, eq(units.vendorId, vendors.id))
    .where(eq(units.vendorId, vendorId))
    .orderBy(desc(units.id));

  return rows
    .filter((row) => row.vendorId === vendorId)
    .map(asTaggedUnit);
}

export type UnlinkResult =
  | { ok: true; unit: TaggedUnit }
  | { ok: false; message: string };

/** Vendor correction: remove an in-stock linked unit and net it out of on-hand. */
export async function unlinkUnit(
  unitId: number,
  userId: number,
  db: AppDb = getDb(),
): Promise<UnlinkResult> {
  const [actor] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!actor || !actor.active || actor.role !== "vendor_rep" || actor.vendorId == null) {
    return { ok: false, message: "Only a vendor rep can unlink their own units." };
  }

  const [row] = await db
    .select({
      id: units.id,
      tagEpc: units.tagEpc,
      productId: units.productId,
      vendorId: units.vendorId,
      lot: units.lot,
      expiry: units.expiry,
      status: units.status,
      checkedInAt: units.checkedInAt,
      checkedInBy: units.checkedInBy,
      caseId: units.caseId,
      checkedOutAt: units.checkedOutAt,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorName: vendors.name,
      kuOwned: products.kuOwned,
    })
    .from(units)
    .innerJoin(products, eq(units.productId, products.id))
    .innerJoin(vendors, eq(units.vendorId, vendors.id))
    .where(eq(units.id, unitId))
    .limit(1);

  if (!row || row.vendorId !== actor.vendorId) {
    return { ok: false, message: "That unit is not in your inventory." };
  }
  if (row.status !== "in_stock") {
    return { ok: false, message: "Only in-stock units can be unlinked." };
  }

  const unit = asTaggedUnit(row);
  const locationId = await shelfLocationId(db);
  const at = nowEventAt();
  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "pulled",
      productId: unit.productId,
      locationId,
      lot: unit.lot,
      expiry: unit.expiry,
      qty: 1,
      at,
      byUserId: userId,
    })
    .returning();

  await db.delete(units).where(eq(units.id, unit.id));
  await audit(
    {
      userId,
      container: 1,
      entity: "units",
      entityId: unit.id,
      action: "unlink",
      detail: `tag=${unit.tagEpc} product=${unit.productId} event=${event.id}`,
    },
    db,
  );
  return { ok: true, unit };
}

/** in_stock counts by product/lot/expiry. Used to overlay tagged-product on-hand. */
export async function taggedOnHand(
  db: AppDb = getDb(),
): Promise<UnitOnHandRow[]> {
  const rows = await db
    .select({
      productId: units.productId,
      lot: units.lot,
      expiry: units.expiry,
      status: units.status,
    })
    .from(units);

  const map = new Map<string, UnitOnHandRow>();
  for (const row of rows) {
    if (row.status !== "in_stock") continue;
    const key = `${row.productId}|${row.lot}|${row.expiry}`;
    const cur = map.get(key) ?? {
      productId: row.productId,
      lot: row.lot,
      expiry: row.expiry,
      onHand: 0,
    };
    cur.onHand += 1;
    map.set(key, cur);
  }
  return [...map.values()];
}

export function unitKey(productId: number, lot: string | null, expiry: string | null) {
  return `${productId}|${lot ?? ""}|${expiry ?? ""}`;
}

export type CheckInProduct = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorId: number;
  vendorName: string;
  hospitalOwned: boolean;
  lot: string;
  expiry: string;
  reads: string[];
};

export type CheckInIdentifyResult =
  | { status: "ready"; product: CheckInProduct }
  | {
      status: "needs_lot";
      message: string;
      raw: string;
      product: Omit<CheckInProduct, "lot" | "expiry">;
      reads: string[];
    }
  | { status: "unknown"; message: string; raw: string }
  | { status: "error"; message: string };

/** First step of vendor check-in: identify the product barcode (item, then lot). */
export async function identifyCheckInProduct(
  input: { raw: string; pendingRaw?: string | null; lot?: string | null; expiry?: string | null },
  userId: number,
  db: AppDb = getDb(),
): Promise<CheckInIdentifyResult> {
  const raw = input.raw.replace(/\u0000/g, "").trim();
  if (!raw) return { status: "error", message: "Empty scan" };

  const [actor] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!actor || actor.role !== "vendor_rep" || actor.vendorId == null) {
    return { status: "error", message: "Only a vendor rep can check in tagged units." };
  }

  const scanned = parseBarcode(raw);
  if (isLotExpiryOnly(scanned)) {
    const pendingRaw = (input.pendingRaw ?? "").trim();
    if (!pendingRaw) {
      return {
        status: "error",
        message: "Scan the item barcode first. This label has only lot and expiry.",
      };
    }
    const pair = pairLotScan(pendingRaw, scanned);
    if (!pair.ok) return { status: "error", message: pair.message };
    const nested = await identifyCheckInProduct(
      {
        raw: pendingRaw,
        lot: pair.lot ?? input.lot,
        expiry: pair.expiry ?? input.expiry,
      },
      userId,
      db,
    );
    if (nested.status === "ready") {
      nested.product.reads = [...nested.product.reads, describeScan(scanned)];
    }
    return nested;
  }

  const { parsed, product } = await identifyProduct(raw, db);
  if (!product) {
    await recordUnmappedBarcode(raw, "arrival", userId, db, actor.vendorId);
    return { status: "unknown", message: "Unknown barcode. Nothing was linked.", raw };
  }

  const info = {
    productId: product.productId,
    catalogNumber: product.catalogNumber,
    description: product.description,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    hospitalOwned: product.hospitalOwned,
  };

  if (product.hospitalOwned || product.vendorId !== actor.vendorId) {
    await recordRejectedArrival(
      {
        rawBarcode: raw,
        actorVendorId: actor.vendorId,
        productId: product.productId,
        reason: product.hospitalOwned ? "hospital_owned" : "wrong_vendor",
        productVendorName: product.vendorName,
      },
      userId,
      db,
    );
    return {
      status: "error",
      message: product.hospitalOwned
        ? `${product.description} is hospital-owned. Vendors cannot check it in.`
        : `${product.description} belongs to ${product.vendorName}. You can only check in your own products.`,
    };
  }

  const lot = (input.lot?.trim() || parsed.lot || "").trim();
  const expiry = (input.expiry?.trim() || parsed.expiry || "").trim();
  if (!lot || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    return {
      status: "needs_lot",
      message: "Scan the lot and expiry barcode, or enter them.",
      raw,
      product: info,
      reads: [describeScan(parsed)],
    };
  }
  if (isExpired(expiry)) {
    return { status: "error", message: `Expired item — not accepted (expiry ${expiry})` };
  }

  return {
    status: "ready",
    product: { ...info, lot, expiry, reads: [describeScan(parsed)] },
  };
}
