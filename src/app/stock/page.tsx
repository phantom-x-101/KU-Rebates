import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StockTable } from "@/components/StockTable";
import { listArrivalLocations } from "@/lib/arrival";
import { canManageSettings, listVendors } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import { listReorderView } from "@/lib/reorder";
import {
  ensureExpiredOnShelfExceptions,
  listStockView,
  type StockFlag,
} from "@/lib/stock-view";

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
  // vendor_rep uses the portal only — never the full stock view
  if (user.role === "vendor_rep") {
    redirect("/vendor");
  }

  const sp = await searchParams;
  const locationId = sp.locationId ?? "";
  const vendorId = sp.vendorId ?? "";
  const flag = (sp.flag ?? "all") as StockFlag | "all" | "below_par";

  if (canManageSettings(user)) {
    await ensureExpiredOnShelfExceptions(user.id);
  }

  const [stockRows, locations, vendors, reorder] = await Promise.all([
    listStockView({
      locationId: locationId ? Number(locationId) : undefined,
      vendorId: vendorId ? Number(vendorId) : undefined,
      flag: flag === "below_par" ? "all" : flag,
    }),
    listArrivalLocations(),
    listVendors(),
    listReorderView(),
  ]);

  const reorderByProduct = new Map(reorder.map((row) => [row.productId, row]));
  const enriched = stockRows.map((row) => {
    const suggestion = reorderByProduct.get(row.productId);
    return {
      ...row,
      parLevel: suggestion?.parLevel ?? null,
      lowStock: suggestion?.lowStock ?? false,
      suggestion: suggestion?.suggestion ?? "No par level on this product.",
    };
  });
  const rows =
    flag === "below_par" ? enriched.filter((row) => row.lowStock) : enriched;

  const expiring = enriched.filter((r) => r.flag === "expiring_soon").length;
  const expired = enriched.filter((r) => r.flag === "expired").length;
  const belowPar = enriched.filter((r) => r.lowStock).length;

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
          <strong className="text-amber-800">{expiring} expiring</strong>,{" "}
          <strong className="text-red-800">{expired} expired</strong>,{" "}
          <strong className="text-amber-800">{belowPar} below par</strong>.
          Suggestions only — there is no order button.
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
