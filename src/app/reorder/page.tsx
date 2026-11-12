import Link from "next/link";
import { ReorderButton } from "@/components/ReorderButton";
import { getCurrentUser } from "@/lib/session";
import { listReorderView } from "@/lib/reorder";

export const dynamic = "force-dynamic";

export default async function ReorderPage() {
  const user = await getCurrentUser();
  const allowed =
    user &&
    user.active &&
    ["supply_chain", "admin", "vendor_rep"].includes(user.role);
  if (!allowed) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Reorder view</h1>
        <p className="text-sm text-amber-800">
          Reorder suggestions are for supply chain, admin, and the vendor rep.
        </p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  const rows = (await listReorderView()).filter((row) =>
    user.role === "vendor_rep" ? row.vendorId === user.vendorId : true,
  );
  const low = rows.filter((r) => r.lowStock).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reorder view</h1>
        <p className="mt-1 text-sm text-slate-600">
          Par level vs on-hand. Reorder notes a suggestion. This prototype does not place the order.
        </p>
        <p className="mt-1 text-sm">
          <strong className="text-amber-800">{low} low-stock</strong> item
          {low === 1 ? "" : "s"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Department</th>
              <th className="py-2 pr-3 font-medium">Mode</th>
              <th className="py-2 pr-3 font-medium">Par</th>
              <th className="py-2 pr-3 font-medium">On hand</th>
              <th className="py-2 pr-3 font-medium">Flag</th>
              <th className="py-2 pr-3 font-medium">Suggestion</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.productId}-${r.departmentId}`}
                className="border-b border-slate-200 align-top"
              >
                <td className="py-2 pr-3">
                  {r.vendorName}{" "}
                  <span className="font-mono text-xs">{r.catalogNumber}</span>
                </td>
                <td className="py-2 pr-3">{r.departmentName}</td>
                <td className="py-2 pr-3 font-mono text-xs">{r.accessMode}</td>
                <td className="py-2 pr-3">{r.parLevel ?? "—"}</td>
                <td className="py-2 pr-3 font-semibold">{r.onHand}</td>
                <td className="py-2 pr-3">
                  {r.lowStock ? (
                    <span className="font-medium text-amber-800">Low stock</span>
                  ) : (
                    <span className="text-slate-600">OK</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-slate-700">{r.suggestion}</td>
                <td className="py-2">
                  {r.lowStock ? <ReorderButton productId={r.productId} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
