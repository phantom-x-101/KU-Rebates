import { getDb, type AppDb } from "@/db";
import { listVendorStock } from "@/lib/vendor-portal";
import { listVendorUsage } from "@/lib/vendor-portal";

export type UsageRankRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  qty: number;
};

export type UsageDayRow = {
  day: string;
  qty: number;
};

export type OnHandVsParRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  onHand: number;
  parLevel: number | null;
  belowPar: boolean;
};

export type VendorDashboard = {
  mostUsed: UsageRankRow[];
  leastUsed: UsageRankRow[];
  usageOverTime: UsageDayRow[];
  onHandVsPar: OnHandVsParRow[];
  expiringSoon: Awaited<ReturnType<typeof listVendorStock>>;
};

export async function getVendorDashboard(
  vendorId: number,
  today: Date = new Date(),
  db: AppDb = getDb(),
): Promise<VendorDashboard> {
  const [stock, usage] = await Promise.all([
    listVendorStock(vendorId, { flag: "all" }, today, db),
    listVendorUsage(vendorId, {}, db),
  ]);

  const usedByProduct = new Map<number, UsageRankRow>();
  for (const row of usage) {
    const cur = usedByProduct.get(row.productId) ?? {
      productId: row.productId,
      catalogNumber: row.catalogNumber,
      description: row.description,
      qty: 0,
    };
    cur.qty += row.qty;
    usedByProduct.set(row.productId, cur);
  }
  for (const row of stock) {
    if (!usedByProduct.has(row.productId)) {
      usedByProduct.set(row.productId, {
        productId: row.productId,
        catalogNumber: row.catalogNumber,
        description: row.description,
        qty: 0,
      });
    }
  }
  const ranked = [...usedByProduct.values()].sort((a, b) => b.qty - a.qty);

  const byDay = new Map<string, number>();
  for (const row of usage) {
    byDay.set(row.caseDate, (byDay.get(row.caseDate) ?? 0) + row.qty);
  }

  const parSeen = new Set<number>();
  const onHandVsPar: OnHandVsParRow[] = [];
  for (const row of stock) {
    if (parSeen.has(row.productId)) continue;
    parSeen.add(row.productId);
    onHandVsPar.push({
      productId: row.productId,
      catalogNumber: row.catalogNumber,
      description: row.description,
      onHand: row.productOnHand,
      parLevel: row.parLevel,
      belowPar: row.belowPar,
    });
  }

  return {
    mostUsed: ranked.slice(0, 5),
    leastUsed: [...ranked].reverse().slice(0, 5),
    usageOverTime: [...byDay.entries()]
      .map(([day, qty]) => ({ day, qty }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    onHandVsPar,
    expiringSoon: stock.filter(
      (row) => row.flag === "expiring_soon" || row.flag === "expired",
    ),
  };
}
