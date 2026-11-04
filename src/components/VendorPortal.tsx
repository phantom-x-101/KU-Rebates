"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { StockViewRow } from "@/lib/stock-view";
import type { VendorExpiryAlert, VendorUsageRow } from "@/lib/vendor-portal";

type Loc = { id: number; name: string };

function flagClass(flag: string) {
  if (flag === "expired") return "text-red-800 font-semibold";
  if (flag === "expiring_soon") return "text-amber-800 font-semibold";
  return "text-slate-700";
}

export function VendorPortal({
  vendorName,
  stock,
  usage,
  alerts,
  locations,
  filters,
}: {
  vendorName: string;
  stock: StockViewRow[];
  usage: VendorUsageRow[];
  alerts: VendorExpiryAlert[];
  locations: Loc[];
  filters: { locationId: string; fromDate: string; toDate: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.push(`/vendor?${next.toString()}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Vendor portal — {vendorName}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Own stock by location, usage by case date (date / room / procedure
          only), and expiry alerts. No on-site audit; no other vendor&apos;s
          data.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="expiry-heading">
        <h2 id="expiry-heading" className="text-lg font-medium">
          Expiry alerts
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-600">No expiring or expired lots.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {alerts.map((a) => (
              <li
                key={`alert-${a.productId}-${a.locationId}-${a.lot}-${a.expiry}`}
                className="rounded border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className={flagClass(a.flag)}>{a.alertLabel}</span>
                {" — "}
                <span className="font-mono text-xs">{a.catalogNumber}</span>{" "}
                {a.description}; lot {a.lot ?? "—"} expires {a.expiry ?? "—"};{" "}
                {a.onHand} on hand at {a.locationName ?? "—"}.
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="stock-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="stock-heading" className="text-lg font-medium">
            Stock by location
          </h2>
          <label className="text-sm">
            <span className="text-slate-600">Location</span>
            <select
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={filters.locationId}
              onChange={(e) => setFilter("locationId", e.target.value)}
            >
              <option value="">All</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">Catalog</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 font-medium">Location</th>
                <th className="py-2 pr-3 font-medium">Lot</th>
                <th className="py-2 pr-3 font-medium">Expiry</th>
                <th className="py-2 pr-3 font-medium">On hand</th>
                <th className="py-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-slate-500">
                    No on-hand stock for your vendor.
                  </td>
                </tr>
              ) : (
                stock.map((r) => (
                  <tr
                    key={`${r.productId}-${r.locationId}-${r.lot}-${r.expiry}`}
                    className="border-b border-slate-200"
                  >
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.catalogNumber}
                    </td>
                    <td className="py-2 pr-3">{r.description}</td>
                    <td className="py-2 pr-3">{r.locationName ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.lot ?? "—"}
                    </td>
                    <td className="py-2 pr-3">{r.expiry ?? "—"}</td>
                    <td className="py-2 pr-3 font-semibold">{r.onHand}</td>
                    <td className={`py-2 ${flagClass(r.flag)}`}>{r.flag}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="usage-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="usage-heading" className="text-lg font-medium">
            Usage by case date
          </h2>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="text-slate-600">From</span>
              <input
                type="date"
                className="mt-1 block rounded border border-slate-300 px-2 py-1"
                value={filters.fromDate}
                onChange={(e) => setFilter("fromDate", e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">To</span>
              <input
                type="date"
                className="mt-1 block rounded border border-slate-300 px-2 py-1"
                value={filters.toDate}
                onChange={(e) => setFilter("toDate", e.target.value)}
              />
            </label>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Case shown as date, room, and procedure type only — no patient
          identifiers.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Room</th>
                <th className="py-2 pr-3 font-medium">Procedure</th>
                <th className="py-2 pr-3 font-medium">Catalog</th>
                <th className="py-2 pr-3 font-medium">Lot</th>
                <th className="py-2 pr-3 font-medium">Qty</th>
                <th className="py-2 font-medium">Disposition</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-slate-500">
                    No usage rows for your vendor in this range.
                  </td>
                </tr>
              ) : (
                usage.map((u, i) => (
                  <tr
                    key={`${u.caseId}-${u.productId}-${u.lot}-${u.disposition}-${i}`}
                    className="border-b border-slate-200"
                  >
                    <td className="py-2 pr-3">{u.caseDate}</td>
                    <td className="py-2 pr-3">{u.roomName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {u.procedureTypeName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {u.catalogNumber}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {u.lot ?? "—"}
                    </td>
                    <td className="py-2 pr-3">{u.qty}</td>
                    <td className="py-2">{u.disposition}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
