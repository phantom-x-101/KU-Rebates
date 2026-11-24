import {
  updateExpiryDaysAction,
  updateParAction,
} from "@/app/vendor/actions";
import { getCurrentUser } from "@/lib/session";
import { listVendorUnits } from "@/lib/units";
import {
  canAccessVendorPortal,
  getVendorName,
  listVendorStock,
  requireVendorRepScope,
} from "@/lib/vendor-portal";
import { getVendorExpiryDays } from "@/lib/vendor-settings";

export const dynamic = "force-dynamic";

function flagLabel(row: {
  flag: string;
  belowPar: boolean;
  daysUntilExpiry: number | null;
}) {
  const parts: string[] = [];
  if (row.flag === "expired") parts.push("Expired");
  else if (row.flag === "expiring_soon") {
    parts.push(
      row.daysUntilExpiry != null
        ? `Expiring soon (${row.daysUntilExpiry}d)`
        : "Expiring soon",
    );
  }
  if (row.belowPar) parts.push("Low stock");
  return parts.join(" · ") || "OK";
}

export default async function VendorStockPage() {
  const user = await getCurrentUser();
  if (!canAccessVendorPortal(user)) {
    return (
      <p className="text-sm text-amber-800">
        Inventory is limited to the signed-in vendor rep.
      </p>
    );
  }

  const { vendorId } = requireVendorRepScope(user);
  const [vendorName, stock, daysBefore, tagged] = await Promise.all([
    getVendorName(vendorId),
    listVendorStock(vendorId),
    getVendorExpiryDays(vendorId),
    listVendorUnits(vendorId),
  ]);
  const inStockCount = tagged.filter((row) => row.status === "in_stock").length;

  const parRows = new Map<
    number,
    { catalogNumber: string; description: string; parLevel: number | null }
  >();
  for (const row of stock) {
    if (!parRows.has(row.productId)) {
      parRows.set(row.productId, {
        catalogNumber: row.catalogNumber,
        description: row.description,
        parLevel: row.parLevel,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Inventory — {vendorName ?? "your vendor"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Tagged units show individually (on hand = units in stock). Untagged
          lots still come from stock events. You set par and how many days
          before expiry to alert.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Tagged units</h2>
        <p className="mt-1 text-sm text-slate-600">
          {tagged.length} unit{tagged.length === 1 ? "" : "s"} · {inStockCount}{" "}
          in stock
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-slate-600">
                <th className="py-2 pr-3 font-medium">Tag</th>
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Lot</th>
                <th className="py-2 pr-3 font-medium">Expiry</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tagged.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-mono text-xs">{row.tagDisplay}</td>
                  <td className="py-2 pr-3">
                    {row.description}
                    <span className="mt-0.5 block font-mono text-xs text-slate-500">
                      {row.catalogNumber}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.lot}</td>
                  <td className="py-2 pr-3">{row.expiry}</td>
                  <td className="py-2 font-semibold">
                    {row.status.replace("_", " ")}
                  </td>
                </tr>
              ))}
              {tagged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-slate-500">
                    No tagged units yet. Check in a tag to add one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Expiry alert</h2>
        <form action={updateExpiryDaysAction} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Days before expiry
            <input
              name="daysBefore"
              type="number"
              min={1}
              defaultValue={daysBefore}
              className="mt-1 block w-28 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-pc-teal px-3 py-2 text-sm font-semibold text-white"
          >
            Save
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Par levels</h2>
        <ul className="mt-2 space-y-2">
          {[...parRows.entries()].map(([productId, row]) => (
            <li key={productId}>
              <form action={updateParAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="productId" value={productId} />
                <p className="min-w-[16rem] flex-1 text-sm">
                  {row.description}
                  <span className="mt-0.5 block font-mono text-xs text-slate-500">
                    {row.catalogNumber}
                  </span>
                </p>
                <label className="text-sm">
                  Par
                  <input
                    name="parLevel"
                    type="number"
                    min={0}
                    defaultValue={row.parLevel ?? 0}
                    className="mt-1 block w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold"
                >
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Lot</th>
              <th className="py-2 pr-3 font-medium">Expiry</th>
              <th className="py-2 pr-3 font-medium">Location</th>
              <th className="py-2 pr-3 font-medium">On hand</th>
              <th className="py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => (
              <tr
                key={`${row.productId}-${row.lot}-${row.expiry}-${row.locationId}`}
                className="border-t border-slate-100"
              >
                <td className="py-2 pr-3">
                  {row.catalogNumber}
                  <span className="mt-0.5 block text-xs text-slate-600">
                    {row.description}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{row.lot ?? "—"}</td>
                <td className="py-2 pr-3">{row.expiry ?? "—"}</td>
                <td className="py-2 pr-3">{row.locationName ?? "—"}</td>
                <td className="py-2 pr-3 font-semibold">{row.onHand}</td>
                <td
                  className={`py-2 ${
                    row.flag === "expired"
                      ? "font-semibold text-red-800"
                      : row.flag === "expiring_soon" || row.belowPar
                        ? "font-semibold text-amber-800"
                        : "text-slate-600"
                  }`}
                >
                  {flagLabel(row)}
                </td>
              </tr>
            ))}
            {stock.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-slate-500">
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
