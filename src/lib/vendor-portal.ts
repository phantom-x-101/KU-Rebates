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
import { eventDay } from "@/lib/event-time";
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
  disposition: "used";
  hospitalOwned: boolean;
  vendorName: string;
};

export type VendorReturnRow = {
  returnedAt: string;
  productId: number;
  catalogNumber: string;
  description: string;
  lot: string | null;
  qty: number;
  caseId: number;
  caseDate: string;
  roomName: string | null;
  procedureTypeName: string | null;
  vendorName: string;
};

/**
 * Billable usage: Check out (pulled) minus RETURN on the same case/product/lot.
 * A returned unit is netted out so the vendor is not billed for it.
 * Pass vendorId to isolate one vendor in the data layer.
 */
export async function listVendorUsage(
  vendorId: number | null,
  filters: { fromDate?: string; toDate?: string } = {},
  db: AppDb = getDb(),
): Promise<VendorUsageRow[]> {
  const rows = await db
    .select({
      eventType: stockEvents.eventType,
      eventId: stockEvents.id,
      caseId: cases.id,
      caseDate: cases.openedAt,
      roomName: rooms.name,
      procedureTypeName: procedureTypes.name,
      productId: products.id,
      catalogNumber: products.catalogNumber,
      description: products.description,
      productVendorId: products.vendorId,
      vendorName: vendors.name,
      hospitalOwned: products.kuOwned,
      lot: stockEvents.lot,
      qty: stockEvents.qty,
    })
    .from(stockEvents)
    .innerJoin(products, eq(stockEvents.productId, products.id))
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .innerJoin(cases, eq(stockEvents.caseId, cases.id))
    .leftJoin(rooms, eq(cases.roomId, rooms.id))
    .leftJoin(procedureTypes, eq(cases.procedureTypeId, procedureTypes.id))
    .where(
      vendorId != null
        ? and(
            inArray(stockEvents.eventType, ["pulled", "returned"]),
            eq(products.vendorId, vendorId),
          )
        : inArray(stockEvents.eventType, ["pulled", "returned"]),
    )
    .orderBy(desc(cases.openedAt), desc(stockEvents.id));

  type Acc = VendorUsageRow & { sortId: number };
  const grouped = new Map<string, Acc>();
  for (const r of rows) {
    if (vendorId != null && r.productVendorId !== vendorId) continue;
    const key = `${r.caseId}|${r.productId}|${r.lot ?? ""}`;
    const cur = grouped.get(key) ?? {
      caseId: r.caseId,
      caseDate: eventDay(r.caseDate),
      roomName: r.roomName,
      procedureTypeName: r.procedureTypeName,
      productId: r.productId,
      catalogNumber: r.catalogNumber,
      description: r.description,
      lot: r.lot,
      qty: 0,
      disposition: "used" as const,
      hospitalOwned: r.hospitalOwned === 1,
      vendorName: r.vendorName,
      sortId: r.eventId,
    };
    if (r.eventType === "pulled") cur.qty += r.qty;
    else if (r.eventType === "returned") cur.qty -= r.qty;
    if (r.eventId > cur.sortId) cur.sortId = r.eventId;
    grouped.set(key, cur);
  }

  return [...grouped.values()]
    .filter((r) => r.qty > 0)
    .filter((r) => {
      if (filters.fromDate && r.caseDate < filters.fromDate) return false;
      if (filters.toDate && r.caseDate > filters.toDate) return false;
      return true;
    })
    .sort((a, b) => b.caseDate.localeCompare(a.caseDate) || b.sortId - a.sortId)
    .map(({ sortId: _sortId, ...row }) => row);
}

/** Items KU returned to the shelf. Read-only for the vendor. */
export async function listVendorReturns(
  vendorId: number | null,
  db: AppDb = getDb(),
): Promise<VendorReturnRow[]> {
  const rows = await db
    .select({
      returnedAt: stockEvents.at,
      productId: products.id,
      catalogNumber: products.catalogNumber,
      description: products.description,
      productVendorId: products.vendorId,
      vendorName: vendors.name,
      lot: stockEvents.lot,
      qty: stockEvents.qty,
      caseId: cases.id,
      caseDate: cases.openedAt,
      roomName: rooms.name,
      procedureTypeName: procedureTypes.name,
    })
    .from(stockEvents)
    .innerJoin(products, eq(stockEvents.productId, products.id))
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .innerJoin(cases, eq(stockEvents.caseId, cases.id))
    .leftJoin(rooms, eq(cases.roomId, rooms.id))
    .leftJoin(procedureTypes, eq(cases.procedureTypeId, procedureTypes.id))
    .where(
      vendorId != null
        ? and(
            eq(stockEvents.eventType, "returned"),
            eq(products.vendorId, vendorId),
          )
        : eq(stockEvents.eventType, "returned"),
    )
    .orderBy(desc(stockEvents.at), desc(stockEvents.id));

  return rows
    .filter((r) => vendorId == null || r.productVendorId === vendorId)
    .map((r) => ({
      returnedAt: r.returnedAt.slice(0, 10),
      productId: r.productId,
      catalogNumber: r.catalogNumber,
      description: r.description,
      lot: r.lot,
      qty: r.qty,
      caseId: r.caseId,
      caseDate: r.caseDate.slice(0, 10),
      roomName: r.roomName,
      procedureTypeName: r.procedureTypeName,
      vendorName: r.vendorName,
    }));
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
