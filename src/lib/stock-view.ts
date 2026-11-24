import { and, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  exceptions,
  expiryRules,
  productAccess,
  products,
  stockEvents,
  storageLocations,
  vendors,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { nowEventAt } from "@/lib/event-time";
import { stockOnHand } from "@/lib/stock";

export type StockFlag = "ok" | "expiring_soon" | "expired";

export type StockViewRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorId: number;
  vendorName: string;
  hospitalOwned: boolean;
  locationId: number | null;
  locationName: string | null;
  lot: string | null;
  expiry: string | null;
  onHand: number;
  daysBeforeAlert: number;
  flag: StockFlag;
  daysUntilExpiry: number | null;
  parLevel: number | null;
  productOnHand: number;
  belowPar: boolean;
};

function daysUntil(expiryIso: string | null, today: Date): number | null {
  if (!expiryIso) return null;
  const exp = new Date(`${expiryIso}T00:00:00Z`);
  if (Number.isNaN(exp.getTime())) return null;
  const t = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.floor((exp.getTime() - t) / (24 * 60 * 60 * 1000));
}

export async function listStockView(
  filters: {
    productId?: number;
    locationId?: number | null;
    vendorId?: number;
    flag?: StockFlag | "all";
  } = {},
  today: Date = new Date(),
  db: AppDb = getDb(),
): Promise<StockViewRow[]> {
  const onHand = await stockOnHand(
    {
      productId: filters.productId,
      locationId: filters.locationId,
    },
    db,
  );

  const productRows = await db
    .select({
      id: products.id,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorId: products.vendorId,
      vendorName: vendors.name,
      kuOwned: products.kuOwned,
    })
    .from(products)
    .innerJoin(vendors, eq(products.vendorId, vendors.id));

  const locations = await db.select().from(storageLocations);
  const rules = await db.select().from(expiryRules);
  const access = await db.select().from(productAccess);

  const productById = new Map(productRows.map((p) => [p.id, p]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const parByProduct = new Map<number, number | null>();
  for (const row of access) {
    if (!parByProduct.has(row.productId)) parByProduct.set(row.productId, row.parLevel);
  }
  const productOnHand = new Map<number, number>();
  for (const row of onHand) {
    productOnHand.set(
      row.productId,
      (productOnHand.get(row.productId) ?? 0) + row.onHand,
    );
  }

  function daysBeforeForVendor(vendorId: number): number {
    const vendorRule = rules.find((r) => r.vendorId === vendorId);
    if (vendorRule) return vendorRule.daysBefore;
    const global = rules.find((r) => r.vendorId == null);
    return global?.daysBefore ?? 60;
  }

  let rows: StockViewRow[] = [];
  for (const r of onHand) {
    const p = productById.get(r.productId);
    if (!p) continue;
    if (filters.vendorId !== undefined && p.vendorId !== filters.vendorId) {
      continue;
    }
    const days = daysUntil(r.expiry, today);
    const alertDays = daysBeforeForVendor(p.vendorId);
    let flag: StockFlag = "ok";
    if (days !== null && days < 0) flag = "expired";
    else if (days !== null && days <= alertDays) flag = "expiring_soon";

    const parLevel = parByProduct.get(p.id) ?? null;
    const total = productOnHand.get(p.id) ?? 0;
    rows.push({
      productId: r.productId,
      catalogNumber: p.catalogNumber,
      description: p.description,
      vendorId: p.vendorId,
      vendorName: p.vendorName,
      hospitalOwned: p.kuOwned === 1,
      locationId: r.locationId,
      locationName:
        r.locationId != null ? (locById.get(r.locationId)?.name ?? null) : null,
      lot: r.lot,
      expiry: r.expiry,
      onHand: r.onHand,
      daysBeforeAlert: alertDays,
      flag,
      daysUntilExpiry: days,
      parLevel,
      productOnHand: total,
      belowPar: parLevel != null && total < parLevel,
    });
  }

  if (filters.flag && filters.flag !== "all") {
    rows = rows.filter((r) => r.flag === filters.flag);
  }

  rows.sort((a, b) => {
    const flagOrder = { expired: 0, expiring_soon: 1, ok: 2 } as const;
    const fo = flagOrder[a.flag] - flagOrder[b.flag];
    if (fo !== 0) return fo;
    return (a.expiry ?? "").localeCompare(b.expiry ?? "");
  });

  return rows;
}

/**
 * Create open expired_on_shelf exceptions for expired lots still on hand.
 * Pass `stock` when the caller already has the stock view, to skip a rebuild.
 */
export async function ensureExpiredOnShelfExceptions(
  userId: number | null,
  today: Date = new Date(),
  db: AppDb = getDb(),
  stock?: StockViewRow[],
) {
  const rows = stock
    ? stock.filter((row) => row.flag === "expired")
    : await listStockView({ flag: "expired" }, today, db);
  const created: number[] = [];
  if (rows.length === 0) return { expiredLots: 0, createdExceptionIds: created };

  const openRows = await db
    .select({ productId: exceptions.productId })
    .from(exceptions)
    .where(
      and(
        eq(exceptions.type, "expired_on_shelf"),
        eq(exceptions.status, "open"),
      ),
    );
  const flagged = new Set(openRows.map((row) => row.productId));

  for (const row of rows) {
    if (flagged.has(row.productId)) continue;
    flagged.add(row.productId);

    const [exc] = await db
      .insert(exceptions)
      .values({
        sourceContainer: 1,
        type: "expired_on_shelf",
        productId: row.productId,
        status: "open",
        ownerUserId: null,
      })
      .returning();

    await audit(
      {
        userId,
        container: 1,
        entity: "exceptions",
        entityId: exc.id,
        action: "create_expired_on_shelf",
        detail: `product=${row.productId} lot=${row.lot ?? ""} expiry=${row.expiry ?? ""} onHand=${row.onHand}`,
      },
      db,
    );
    created.push(exc.id);
  }

  return { expiredLots: rows.length, createdExceptionIds: created };
}

async function ensureTypedStockExceptions(
  type: "expiring_soon" | "low_stock",
  action: string,
  rows: { productId: number; lot?: string | null; expiry?: string | null; onHand?: number }[],
  userId: number | null,
  db: AppDb,
) {
  const created: number[] = [];
  if (rows.length === 0) return created;
  const openRows = await db
    .select({ productId: exceptions.productId })
    .from(exceptions)
    .where(and(eq(exceptions.type, type), eq(exceptions.status, "open")));
  const flagged = new Set(openRows.map((row) => row.productId));
  for (const row of rows) {
    if (flagged.has(row.productId)) continue;
    flagged.add(row.productId);
    const [exc] = await db
      .insert(exceptions)
      .values({
        sourceContainer: 1,
        type,
        productId: row.productId,
        status: "open",
        ownerUserId: null,
      })
      .returning();
    await audit(
      {
        userId,
        container: 1,
        entity: "exceptions",
        entityId: exc.id,
        action,
        detail: `product=${row.productId} lot=${row.lot ?? ""} expiry=${row.expiry ?? ""} onHand=${row.onHand ?? ""}`,
      },
      db,
    );
    created.push(exc.id);
  }
  return created;
}

export async function ensureExpiringSoonExceptions(
  userId: number | null,
  today: Date = new Date(),
  db: AppDb = getDb(),
  stock?: StockViewRow[],
) {
  const rows = stock
    ? stock.filter((row) => row.flag === "expiring_soon")
    : await listStockView({ flag: "expiring_soon" }, today, db);
  const createdExceptionIds = await ensureTypedStockExceptions(
    "expiring_soon",
    "create_expiring_soon",
    rows,
    userId,
    db,
  );
  return { expiringLots: rows.length, createdExceptionIds };
}

export async function ensureLowStockExceptions(
  userId: number | null,
  today: Date = new Date(),
  db: AppDb = getDb(),
  stock?: StockViewRow[],
) {
  const rows = stock ?? (await listStockView({}, today, db));
  const seen = new Set<number>();
  const low = rows.filter((row) => {
    if (!row.belowPar || seen.has(row.productId)) return false;
    seen.add(row.productId);
    return true;
  });
  const createdExceptionIds = await ensureTypedStockExceptions(
    "low_stock",
    "create_low_stock",
    low,
    userId,
    db,
  );
  return { lowProducts: low.length, createdExceptionIds };
}

/**
 * Dispose expired stock: write an `expired` stock_event (removes from on-hand).
 * supply_chain / admin only at the action layer.
 */
export async function disposeExpiredLot(
  input: {
    productId: number;
    locationId: number | null;
    lot: string | null;
    expiry: string | null;
    qty?: number;
  },
  userId: number,
  db: AppDb = getDb(),
) {
  const current = await stockOnHand(
    {
      productId: input.productId,
      locationId: input.locationId,
    },
    db,
  );
  const line = current.find(
    (r) =>
      (r.lot ?? null) === (input.lot ?? null) &&
      (r.expiry ?? null) === (input.expiry ?? null) &&
      (r.locationId ?? null) === (input.locationId ?? null),
  );
  if (!line || line.onHand <= 0) {
    throw new Error("No on-hand quantity for this lot");
  }

  const qty = input.qty ?? line.onHand;
  if (qty > line.onHand) {
    throw new Error(`Only ${line.onHand} on hand`);
  }

  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "expired",
      productId: input.productId,
      locationId: input.locationId,
      lot: input.lot,
      expiry: input.expiry,
      qty,
      at: nowEventAt(),
      byUserId: userId,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "stock_events",
      entityId: event.id,
      action: "expired",
      detail: `product=${input.productId} lot=${input.lot ?? ""} qty=${qty} (disposed)`,
    },
    db,
  );

  return event;
}
