import { and, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  exceptions,
  expiryRules,
  products,
  stockEvents,
  storageLocations,
  vendors,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { stockOnHand } from "@/lib/stock";

export type StockFlag = "ok" | "expiring_soon" | "expired";

export type StockViewRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorId: number;
  vendorName: string;
  locationId: number | null;
  locationName: string | null;
  lot: string | null;
  expiry: string | null;
  onHand: number;
  daysBeforeAlert: number;
  flag: StockFlag;
  daysUntilExpiry: number | null;
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
    })
    .from(products)
    .innerJoin(vendors, eq(products.vendorId, vendors.id));

  const locations = await db.select().from(storageLocations);
  const rules = await db.select().from(expiryRules);

  const productById = new Map(productRows.map((p) => [p.id, p]));
  const locById = new Map(locations.map((l) => [l.id, l]));

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

    rows.push({
      productId: r.productId,
      catalogNumber: p.catalogNumber,
      description: p.description,
      vendorId: p.vendorId,
      vendorName: p.vendorName,
      locationId: r.locationId,
      locationName:
        r.locationId != null ? (locById.get(r.locationId)?.name ?? null) : null,
      lot: r.lot,
      expiry: r.expiry,
      onHand: r.onHand,
      daysBeforeAlert: alertDays,
      flag,
      daysUntilExpiry: days,
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

/** Create open expired_on_shelf exceptions for expired lots still on hand. */
export async function ensureExpiredOnShelfExceptions(
  userId: number | null,
  today: Date = new Date(),
  db: AppDb = getDb(),
) {
  const rows = await listStockView({ flag: "expired" }, today, db);
  const created: number[] = [];

  for (const row of rows) {
    const existing = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "expired_on_shelf"),
          eq(exceptions.productId, row.productId),
          eq(exceptions.status, "open"),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;

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
