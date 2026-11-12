"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  disposeExpiredAction,
  scanExpiredOnShelfAction,
  type StockActionState,
} from "@/app/stock/actions";
import { ReorderButton } from "@/components/ReorderButton";
import type { StockViewRow } from "@/lib/stock-view";

type StockTableRow = StockViewRow & {
  parLevel: number | null;
  lowStock: boolean;
  suggestion: string;
};

type Loc = { id: number; name: string };
type Vendor = { id: number; name: string };

const initial: StockActionState = { ok: false, message: "" };

function DisposeButton({ row }: { row: StockTableRow }) {
  const [state, action, pending] = useActionState(disposeExpiredAction, initial);
  if (row.flag !== "expired") return null;
  return (
    <form action={action} className="inline">
      <input type="hidden" name="productId" value={row.productId} />
      <input type="hidden" name="locationId" value={row.locationId ?? ""} />
      <input type="hidden" name="lot" value={row.lot ?? ""} />
      <input type="hidden" name="expiry" value={row.expiry ?? ""} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-amber-800 px-2 py-0.5 text-xs text-white disabled:opacity-60"
      >
        {pending ? "…" : "Mark expired / dispose"}
      </button>
      {state.message ? (
        <span
          className={`ml-1 text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function StockTable({
  rows,
  locations,
  vendors,
  filters,
  canDispose,
  canReorder,
}: {
  rows: StockTableRow[];
  locations: Loc[];
  vendors: Vendor[];
  filters: { locationId: string; vendorId: string; flag: string };
  canDispose: boolean;
  canReorder: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showActions = canReorder || canDispose;
  const [scanMsg, setScanMsg] = useState("");
  const [, start] = useTransition();

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.push(`/stock?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
        <label className="text-sm">
          <span className="text-slate-600">Vendor</span>
          <select
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
            value={filters.vendorId}
            onChange={(e) => setFilter("vendorId", e.target.value)}
          >
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Flag</span>
          <select
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
            value={filters.flag}
            onChange={(e) => setFilter("flag", e.target.value)}
          >
            <option value="all">All</option>
            <option value="expiring_soon">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="below_par">Below par</option>
            <option value="ok">OK</option>
          </select>
        </label>
        {canDispose ? (
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            onClick={() =>
              start(async () => {
                const r = await scanExpiredOnShelfAction();
                setScanMsg(r.message);
              })
            }
          >
            Create expired-on-shelf exceptions
          </button>
        ) : null}
        {scanMsg ? (
          <p className="w-full text-sm text-slate-700">{scanMsg}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Location</th>
              <th className="py-2 pr-3 font-medium">Lot</th>
              <th className="py-2 pr-3 font-medium">Expiry</th>
              <th className="py-2 pr-3 font-medium">On hand</th>
              <th className="py-2 pr-3 font-medium">Par</th>
              <th className="py-2 pr-3 font-medium">Flag</th>
              <th className="py-2 pr-3 font-medium">Suggestion</th>
              {showActions ? <th className="py-2 font-medium">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.productId}-${r.locationId}-${r.lot}-${r.expiry}`}
                className="border-b border-slate-200 align-top"
              >
                <td className="py-2 pr-3">
                  {r.vendorName}{" "}
                  <span className="font-mono text-xs">{r.catalogNumber}</span>
                </td>
                <td className="py-2 pr-3">{r.locationName ?? "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs">{r.lot ?? "—"}</td>
                <td className="py-2 pr-3">{r.expiry ?? "—"}</td>
                <td className="py-2 pr-3 font-semibold">{r.onHand}</td>
                <td className="py-2 pr-3">{r.parLevel ?? "—"}</td>
                <td className="py-2 pr-3">
                  <div className="space-y-1">
                    {r.flag === "expired" ? (
                      <span className="block font-medium text-red-800">Expired</span>
                    ) : null}
                    {r.flag === "expiring_soon" ? (
                      <span className="block font-medium text-amber-800">
                        {r.daysUntilExpiry != null && r.daysUntilExpiry <= 30
                          ? `Expiring within 30 days (${r.daysUntilExpiry}d)`
                          : `Expiring soon${
                              r.daysUntilExpiry != null
                                ? ` (${r.daysUntilExpiry}d)`
                                : ""
                            }`}
                      </span>
                    ) : null}
                    {r.lowStock ? (
                      <span className="block font-medium text-amber-800">Below par</span>
                    ) : null}
                    {r.flag === "ok" && !r.lowStock ? (
                      <span className="text-slate-600">OK</span>
                    ) : null}
                  </div>
                </td>
                <td className="max-w-xs py-2 pr-3 text-slate-700">{r.suggestion}</td>
                {showActions ? (
                  <td className="py-2">
                    <div className="flex flex-col items-start gap-1">
                      {canReorder && r.lowStock ? (
                        <ReorderButton productId={r.productId} />
                      ) : null}
                      {canDispose ? <DisposeButton row={r} /> : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showActions ? 9 : 8} className="py-3 text-slate-500">
                  No stock rows match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
