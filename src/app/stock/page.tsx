import { Suspense } from "react";
import Link from "next/link";
import { StockTable } from "@/components/StockTable";
import { listArrivalLocations } from "@/lib/arrival";
import { canManageSettings, listVendors } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import { listStockView, type StockFlag } from "@/lib/stock-view";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    vendorId?: string;
    flag?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="text-sm text-amber-800">
        Pick a user in the header to view stock.
      </p>
    );
  }

  const sp = await searchParams;
  const locationId = sp.locationId ?? "";
  const vendorId = sp.vendorId ?? "";
  const flag = (sp.flag ?? "all") as StockFlag | "all";

  const [rows, locations, vendors] = await Promise.all([
    listStockView({
      locationId: locationId ? Number(locationId) : undefined,
      vendorId: vendorId ? Number(vendorId) : undefined,
      flag,
    }),
    listArrivalLocations(),
    listVendors(),
  ]);

  const expiring = rows.filter((r) => r.flag === "expiring_soon").length;
  const expired = rows.filter((r) => r.flag === "expired").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock on hand</h1>
        <p className="mt-1 text-sm text-slate-600">
          Derived from stock events. Expiring soon uses each vendor&apos;s{" "}
          <code>expiry_rules.days_before</code>.{" "}
          <Link href="/reorder" className="underline">
            Reorder view
          </Link>
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Alerts:{" "}
          <strong className="text-amber-800">{expiring} expiring soon</strong>,{" "}
          <strong className="text-red-800">{expired} expired</strong>
        </p>
      </div>
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <StockTable
          rows={rows}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          filters={{ locationId, vendorId, flag }}
          canDispose={canManageSettings(user)}
        />
      </Suspense>
    </div>
  );
}
