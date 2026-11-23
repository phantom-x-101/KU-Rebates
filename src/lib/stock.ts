import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { AppDb } from "@/db";
import { stockEvents } from "@/db/schema";

export type StockOnHandRow = {
  productId: number;
  locationId: number | null;
  lot: string | null;
  expiry: string | null;
  onHand: number;
};

/**
 * Stock on hand is DERIVED from stock_events, never stored:
 * on_hand = arrived + returned - pulled - expired
 */
export async function stockOnHand(
  filters: {
    productId?: number;
    locationId?: number | null;
  } = {},
  db: AppDb = getDb(),
): Promise<StockOnHandRow[]> {
  const conditions = [];
  if (filters.productId !== undefined) {
    conditions.push(eq(stockEvents.productId, filters.productId));
  }
  if (filters.locationId !== undefined) {
    if (filters.locationId === null) {
      conditions.push(sql`${stockEvents.locationId} IS NULL`);
    } else {
      conditions.push(eq(stockEvents.locationId, filters.locationId));
    }
  }

  const rows = await db
    .select({
      productId: stockEvents.productId,
      locationId: stockEvents.locationId,
      lot: stockEvents.lot,
      expiry: stockEvents.expiry,
      onHand: sql<number>`
        SUM(CASE
          WHEN ${stockEvents.eventType} = 'arrived' THEN ${stockEvents.qty}
          WHEN ${stockEvents.eventType} = 'returned' THEN ${stockEvents.qty}
          WHEN ${stockEvents.eventType} = 'pulled' THEN -${stockEvents.qty}
          WHEN ${stockEvents.eventType} = 'expired' THEN -${stockEvents.qty}
          ELSE 0
        END)
      `.mapWith(Number),
    })
    .from(stockEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(
      stockEvents.productId,
      stockEvents.locationId,
      stockEvents.lot,
      stockEvents.expiry,
    );

  return rows.filter((r) => r.onHand !== 0);
}

export type PullableLot = {
  lot: string;
  expiry: string;
  locationId: number | null;
  onHand: number;
};

/** Unexpired lots on hand for a product, earliest expiry first. */
export async function listPullableLots(
  productId: number,
  today: Date = new Date(),
  db: AppDb = getDb(),
): Promise<PullableLot[]> {
  const day = today.toISOString().slice(0, 10);
  const rows = await stockOnHand({ productId }, db);
  return rows
    .filter(
      (r): r is StockOnHandRow & { lot: string; expiry: string } =>
        r.onHand > 0 && Boolean(r.lot) && Boolean(r.expiry) && r.expiry! >= day,
    )
    .map((r) => ({
      lot: r.lot,
      expiry: r.expiry,
      locationId: r.locationId,
      onHand: r.onHand,
    }))
    .sort(
      (a, b) =>
        a.expiry.localeCompare(b.expiry) ||
        a.lot.localeCompare(b.lot) ||
        (a.locationId ?? 0) - (b.locationId ?? 0),
    );
}
