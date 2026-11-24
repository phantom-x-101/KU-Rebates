import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  cases,
  exceptions,
  products,
  rooms,
  stockEvents,
  storageLocations,
  vendors,
  type User,
} from "@/db/schema";
import { eventDay } from "@/lib/event-time";
import { listReorderView } from "@/lib/reorder";
import { listStockView } from "@/lib/stock-view";

export const DASHBOARD_ROLES = ["supply_chain", "admin", "category_owner"] as const;

export function canAccessDashboard(
  user: User | null | undefined,
): boolean {
  if (!user || !user.active) return false;
  return DASHBOARD_ROLES.includes(
    user.role as (typeof DASHBOARD_ROLES)[number],
  );
}

function dayBounds(today: Date) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  const start = new Date(Date.UTC(y, m, d)).toISOString();
  const end = new Date(Date.UTC(y, m, d + 1)).toISOString();
  const dayIso = start.slice(0, 10);
  return { start, end, dayIso };
}

export type TakenTodayRow = {
  stockEventId: number;
  at: string;
  productId: number;
  catalogNumber: string;
  description: string;
  vendorName: string;
  locationName: string | null;
  lot: string | null;
  expiry: string | null;
  qty: number;
  caseId: number | null;
  roomName: string | null;
};

export type OpenExceptionRow = {
  id: number;
  type: string;
  sourceContainer: number;
  status: string;
  productId: number | null;
  catalogNumber: string | null;
  createdAt: string;
};

export type ExpiringRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorName: string;
  locationName: string | null;
  lot: string | null;
  expiry: string | null;
  onHand: number;
  daysUntilExpiry: number | null;
};

export type LowStockRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorName: string;
  departmentName: string;
  parLevel: number | null;
  onHand: number;
  suggestion: string;
};

export type SupplyChainDashboard = {
  asOf: string;
  takenToday: TakenTodayRow[];
  takenTodayQty: number;
  openExceptions: OpenExceptionRow[];
  expiringIn30Days: ExpiringRow[];
  lowStock: LowStockRow[];
};

/**
 * supply_chain / admin dashboard: used today (net of returns), open exceptions,
 * lots expiring within 30 days, and low-stock vs par.
 */
export async function getSupplyChainDashboard(
  today: Date = new Date(),
  db: AppDb = getDb(),
): Promise<SupplyChainDashboard> {
  const { dayIso } = dayBounds(today);

  const todayEvents = await db
    .select({
      stockEventId: stockEvents.id,
      eventType: stockEvents.eventType,
      at: stockEvents.at,
      productId: stockEvents.productId,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorName: vendors.name,
      locationName: storageLocations.name,
      lot: stockEvents.lot,
      expiry: stockEvents.expiry,
      qty: stockEvents.qty,
      caseId: stockEvents.caseId,
      roomName: rooms.name,
    })
    .from(stockEvents)
    .innerJoin(products, eq(stockEvents.productId, products.id))
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .leftJoin(
      storageLocations,
      eq(stockEvents.locationId, storageLocations.id),
    )
    .leftJoin(cases, eq(stockEvents.caseId, cases.id))
    .leftJoin(rooms, eq(cases.roomId, rooms.id))
    .where(
      and(
        inArray(stockEvents.eventType, ["pulled", "returned"]),
        sql`substr(${stockEvents.at}, 1, 10) = ${dayIso}`,
      ),
    );

  type Acc = TakenTodayRow;
  const grouped = new Map<string, Acc>();
  for (const r of todayEvents) {
    if (eventDay(r.at) !== dayIso) continue;
    const key = `${r.productId}|${r.lot ?? ""}|${r.expiry ?? ""}|${r.caseId ?? ""}`;
    const cur = grouped.get(key) ?? {
      stockEventId: r.stockEventId,
      at: r.at,
      productId: r.productId,
      catalogNumber: r.catalogNumber,
      description: r.description,
      vendorName: r.vendorName,
      locationName: r.locationName,
      lot: r.lot,
      expiry: r.expiry,
      qty: 0,
      caseId: r.caseId,
      roomName: r.roomName,
    };
    if (r.eventType === "pulled") cur.qty += r.qty;
    else cur.qty -= r.qty;
    if (r.eventType === "pulled" && r.stockEventId < cur.stockEventId) {
      cur.stockEventId = r.stockEventId;
      cur.at = r.at;
    }
    grouped.set(key, cur);
  }

  const takenToday: TakenTodayRow[] = [...grouped.values()]
    .filter((r) => r.qty > 0)
    .sort((a, b) => a.at.localeCompare(b.at) || a.stockEventId - b.stockEventId);

  const openExc = await db
    .select({
      id: exceptions.id,
      type: exceptions.type,
      sourceContainer: exceptions.sourceContainer,
      status: exceptions.status,
      productId: exceptions.productId,
      catalogNumber: products.catalogNumber,
      createdAt: exceptions.createdAt,
    })
    .from(exceptions)
    .leftJoin(products, eq(exceptions.productId, products.id))
    .where(inArray(exceptions.status, ["open", "in_review"]));

  const openExceptions: OpenExceptionRow[] = openExc.map((e) => ({
    id: e.id,
    type: e.type,
    sourceContainer: e.sourceContainer,
    status: e.status,
    productId: e.productId,
    catalogNumber: e.catalogNumber,
    createdAt: e.createdAt,
  }));

  const stock = await listStockView({ flag: "all" }, today, db);
  const expiringIn30Days: ExpiringRow[] = stock
    .filter((r) => {
      if (r.daysUntilExpiry == null) return false;
      return r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30;
    })
    .map((r) => ({
      productId: r.productId,
      catalogNumber: r.catalogNumber,
      description: r.description,
      vendorName: r.vendorName,
      locationName: r.locationName,
      lot: r.lot,
      expiry: r.expiry,
      onHand: r.onHand,
      daysUntilExpiry: r.daysUntilExpiry,
    }));

  const reorder = await listReorderView(db);
  const lowStock: LowStockRow[] = reorder
    .filter((r) => r.lowStock)
    .map((r) => ({
      productId: r.productId,
      catalogNumber: r.catalogNumber,
      description: r.description,
      vendorName: r.vendorName,
      departmentName: r.departmentName,
      parLevel: r.parLevel,
      onHand: r.onHand,
      suggestion: r.suggestion,
    }));

  return {
    asOf: dayIso,
    takenToday,
    takenTodayQty: takenToday.reduce((s, r) => s + r.qty, 0),
    openExceptions,
    expiringIn30Days,
    lowStock,
  };
}
