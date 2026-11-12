"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  assignOwnerAction,
  resolveExceptionAction,
  runTimeoutReconcileAction,
  type ExceptionActionState,
} from "@/app/exceptions/actions";

export type ExceptionRow = {
  id: number;
  sourceContainer: number;
  type: string;
  productId: number | null;
  status: string;
  ownerUserId: number | null;
  ownerName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  catalogNumber: string | null;
  productDescription: string | null;
  vendorName: string | null;
};

type Owner = { id: number; name: string; role: string };

const initial: ExceptionActionState = { ok: false, message: "" };

function AssignForm({
  exceptionId,
  owners,
}: {
  exceptionId: number;
  owners: Owner[];
}) {
  const [state, action, pending] = useActionState(assignOwnerAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <select
        name="ownerUserId"
        required
        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
        defaultValue=""
      >
        <option value="" disabled>
          Owner
        </option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-pc-teal px-2 py-0.5 text-xs text-white disabled:opacity-60"
      >
        Assign
      </button>
      {state.message ? (
        <span
          className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function ResolveForm({ exceptionId }: { exceptionId: number }) {
  const [state, action, pending] = useActionState(
    resolveExceptionAction,
    initial,
  );
  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-1">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <input
        name="resolutionNote"
        required
        placeholder="Resolution note"
        className="min-w-[12rem] flex-1 rounded border border-slate-300 px-1 py-0.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-emerald-800 px-2 py-0.5 text-xs text-white disabled:opacity-60"
      >
        Resolve
      </button>
      {state.message ? (
        <span
          className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function ExceptionQueue({
  rows,
  owners,
  filters,
}: {
  rows: ExceptionRow[];
  owners: Owner[];
  filters: { type: string; container: string; status: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [timeoutMsg, setTimeoutMsg] = useState("");
  const [, start] = useTransition();

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.push(`/exceptions?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-slate-600">Type</span>
          <select
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
            value={filters.type}
            onChange={(e) => updateFilter("type", e.target.value)}
          >
            <option value="">All</option>
            <option value="taken_not_scanned_or_returned">
              taken_not_scanned_or_returned
            </option>
            <option value="closeout_exceeds_taken">closeout_exceeds_taken</option>
            <option value="opened_or_wasted">opened_or_wasted</option>
            <option value="expired_on_shelf">expired_on_shelf</option>
            <option value="not_on_any_contract">not_on_any_contract</option>
            <option value="bill_only_unmapped">bill_only_unmapped</option>
            <option value="missing_from_item_master">
              missing_from_item_master
            </option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Container</span>
          <select
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
            value={filters.container}
            onChange={(e) => updateFilter("container", e.target.value)}
          >
            <option value="">All</option>
            <option value="1">1 consignment</option>
            <option value="2">2 consumption</option>
            <option value="3">3 contracts</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Status</span>
          <select
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
            value={filters.status}
            onChange={(e) => updateFilter("status", e.target.value)}
          >
            <option value="">All</option>
            <option value="open">open</option>
            <option value="in_review">in_review</option>
            <option value="resolved">resolved</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          onClick={() =>
            start(async () => {
              const r = await runTimeoutReconcileAction();
              setTimeoutMsg(r.message);
            })
          }
        >
          Run timeout check
        </button>
        {timeoutMsg ? (
          <p className="w-full text-sm text-slate-700">{timeoutMsg}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th className="py-2 pr-3 font-medium">ID</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Ctr</th>
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Owner</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-3">{r.id}</td>
                <td className="py-2 pr-3 font-mono text-xs">{r.type}</td>
                <td className="py-2 pr-3">{r.sourceContainer}</td>
                <td className="py-2 pr-3">
                  {r.vendorName
                    ? `${r.vendorName} ${r.catalogNumber}`
                    : (r.productId ?? "—")}
                </td>
                <td className="py-2 pr-3">{r.status}</td>
                <td className="py-2 pr-3">{r.ownerName ?? "—"}</td>
                <td className="py-2">
                  {r.status !== "resolved" ? (
                    <>
                      <AssignForm exceptionId={r.id} owners={owners} />
                      <ResolveForm exceptionId={r.id} />
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {r.resolutionNote}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-3 text-slate-500">
                  No exceptions match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
