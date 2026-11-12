import { ReorderButton } from "@/components/ReorderButton";
import { getCurrentUser } from "@/lib/session";
import { listReorderView } from "@/lib/reorder";
import {
  canAccessVendorPortal,
  getVendorName,
  listVendorStock,
  requireVendorRepScope,
} from "@/lib/vendor-portal";

export const dynamic = "force-dynamic";

export default async function VendorStockPage() {
  const user = await getCurrentUser();
  if (!canAccessVendorPortal(user)) {
    return (
      <p className="text-sm text-amber-800">
        Vendor stock is limited to the signed-in vendor rep.
      </p>
    );
  }

  const { vendorId } = requireVendorRepScope(user);
  const [vendorName, stock, reorder] = await Promise.all([
    getVendorName(vendorId),
    listVendorStock(vendorId),
    listReorderView(),
  ]);
  const below = new Set(
    reorder
      .filter((row) => row.vendorId === vendorId && row.lowStock)
      .map((row) => row.productId),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendor stock</h1>
        <p className="mt-1 text-sm text-slate-600">
          {vendorName ?? "Your vendor"} only. Reorder notes a suggestion. This
          prototype does not place the order.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Lot</th>
              <th className="py-2 pr-3 font-medium">Expiry</th>
              <th className="py-2 pr-3 font-medium">On hand</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => (
              <tr key={`${row.productId}-${row.lot}-${row.expiry}`}>
                <td className="py-2 pr-3">
                  {row.catalogNumber}
                  <span className="mt-0.5 block text-xs text-slate-600">
                    {row.description}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{row.lot ?? "—"}</td>
                <td className="py-2 pr-3">{row.expiry ?? "—"}</td>
                <td className="py-2 pr-3 font-semibold">{row.onHand}</td>
                <td className="py-2">
                  {below.has(row.productId) ? (
                    <ReorderButton productId={row.productId} />
                  ) : null}
                </td>
              </tr>
            ))}
            {stock.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-slate-500">
                  No stock for this vendor.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
