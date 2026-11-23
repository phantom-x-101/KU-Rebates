import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  cases,
  products,
  procedureTypes,
  rooms,
  stockEvents,
  vendors,
  type User,
} from "@/db/schema";
import {
  listStockView,
  type StockFlag,
  type StockViewRow,
} from "@/lib/stock-view";

export const VENDOR_PORTAL_ROLE = "vendor_rep" as const;

export type VendorRepUser = User & {
  role: typeof VENDOR_PORTAL_ROLE;
  vendorId: number;
};

/**
 * Resolve the vendor scope for a portal caller.
 * Always returns the user's own vendorId — never trusts a client-supplied vendor.
 */
export function requireVendorRepScope(
  user: User | null | undefined,
): { user: VendorRepUser; vendorId: number } {
  if (!user || !user.active) {
    throw new Error("Vendor portal requires a signed-in vendor_rep");
  }
  if (user.role !== VENDOR_PORTAL_ROLE) {
    throw new Error("Vendor portal is limited to vendor_rep users");
  }
  if (user.vendorId == null) {
    throw new Error("vendor_rep must be linked to a vendor");
  }
  return {
    user: user as VendorRepUser,
    vendorId: user.vendorId,
  };
}

export function canAccessVendorPortal(
  user: User | null | undefined,
): boolean {
  try {
    requireVendorRepScope(user);
    return true;
  } catch {
    return false;
  }
}

/** Own-vendor stock by location/lot. Ignores any other vendorId in filters. */
export async function listVendorStock(
  vendorId: number,
  filters: {
    locationId?: number | null;
    flag?: StockFlag | "all";
  } = {},
  today: Date = new Date(),
  db: AppDb = getDb(),
): Promise<StockViewRow[]> {
  const rows = await listStockView(
    {
      locationId: filters.locationId,
      vendorId, // forced — never omit
      flag: filters.flag,
    },
    today,
    db,
  );
  // Defense in depth: drop anything that somehow isn't this vendor
  return rows.filter((r) => r.vendorId === vendorId);
}

export type VendorExpiryAlert = StockViewRow & {
  alertLabel: string;
};

/** Expiring-soon + expired lots for this vendor (rep pays when expired on shelf). */
export async function listVendorExpiryAlerts(
  vendorId: number,
  today: Date = new Date(),
  db: AppDb = getDb(),
): Promise<VendorExpiryAlert[]> {
  const stock = await listVendorStock(vendorId, { flag: "all" }, today, db);
  return stock
    .filter((r) => r.flag === "expiring_soon" || r.flag === "expired")
    .map((r) => ({
      ...r,
      alertLabel:
        r.flag === "expired"
          ? "Expired on shelf: rep pays"
          : `Expiring soon (${r.daysUntilExpiry ?? "?"} days)`,
    }));
}

export type VendorUsageRow = {
  caseId: number;
  caseDate: string;
  roomName: string | null;
  procedureTypeName: string | null;
  productId: number;
  catalogNumber: string;
  description: string;
  lot: string | null;
  qty: number;
  disposition: "used" | "wasted";
};

/**
 * Usage for the vendor's products by case.
 * Closed cases only: pulled minus returned. Anything still out counts as used.
 * Case identity is date / room / procedure only (no patient fields).
 * Always filtered to `vendorId` in the data layer.
 */
export async function listVendorUsage(
  vendorId: number,
  filters: { fromDate?: string; toDate?: string } = {},
  db: AppDb = getDb(),
): Promise<VendorUsageRow[]> {
  const vendorProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.vendorId, vendorId));
  const productIds = vendorProducts.map((p) => p.id);
  if (productIds.length === 0) return [];

  const rows = await db
    .select({
      caseId: cases.id,
      caseDate: cases.openedAt,
      caseStatus: cases.status,
      roomName: rooms.name,
      procedureTypeName: procedureTypes.name,
      productId: products.id,
      catalogNumber: products.catalogNumber,
      description: products.description,
      productVendorId: products.vendorId,
      lot: stockEvents.lot,
      expiry: stockEvents.expiry,
      qty: stockEvents.qty,
      eventType: stockEvents.eventType,
    })
    .from(stockEvents)
    .innerJoin(products, eq(stockEvents.productId, products.id))
    .innerJoin(cases, eq(stockEvents.caseId, cases.id))
    .leftJoin(rooms, eq(cases.roomId, rooms.id))
    .leftJoin(procedureTypes, eq(cases.procedureTypeId, procedureTypes.id))
    .where(
      and(
        eq(products.vendorId, vendorId),
        eq(cases.status, "closed"),
        inArray(stockEvents.eventType, ["pulled", "returned"]),
        inArray(stockEvents.productId, productIds),
      ),
    )
    .orderBy(desc(cases.openedAt), desc(stockEvents.id));

  type Acc = {
    caseId: number;
    caseDate: string;
    roomName: string | null;
    procedureTypeName: string | null;
    productId: number;
    catalogNumber: string;
    description: string;
    lot: string | null;
    pulled: number;
    returned: number;
  };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    if (r.productVendorId !== vendorId) continue;
    if (r.caseStatus !== "closed") continue;
    const day = r.caseDate.slice(0, 10);
    if (filters.fromDate && day < filters.fromDate) continue;
    if (filters.toDate && day > filters.toDate) continue;
    const key = `${r.caseId}|${r.productId}|${r.lot ?? ""}|${r.expiry ?? ""}`;
    const cur =
      map.get(key) ??
      ({
        caseId: r.caseId,
        caseDate: day,
        roomName: r.roomName,
        procedureTypeName: r.procedureTypeName,
        productId: r.productId,
        catalogNumber: r.catalogNumber,
        description: r.description,
        lot: r.lot,
        pulled: 0,
        returned: 0,
      } satisfies Acc);
    if (r.eventType === "pulled") cur.pulled += r.qty;
    if (r.eventType === "returned") cur.returned += r.qty;
    map.set(key, cur);
  }

  return [...map.values()]
    .map((a) => ({
      caseId: a.caseId,
      caseDate: a.caseDate,
      roomName: a.roomName,
      procedureTypeName: a.procedureTypeName,
      productId: a.productId,
      catalogNumber: a.catalogNumber,
      description: a.description,
      lot: a.lot,
      qty: a.pulled - a.returned,
      disposition: "used" as const,
    }))
    .filter((r) => r.qty > 0)
    .sort((a, b) => {
      const byDate = b.caseDate.localeCompare(a.caseDate);
      if (byDate !== 0) return byDate;
      return b.caseId - a.caseId;
    });
}

export async function getVendorName(
  vendorId: number,
  db: AppDb = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select({ name: vendors.name })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);
  return row?.name ?? null;
}
