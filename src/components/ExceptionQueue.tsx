"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  assignOwnerAction,
  resolveExceptionAction,
  type ExceptionActionState,
} from "@/app/exceptions/actions";

const TYPE_LABELS: Record<string, string> = {
  case_open_past_timeout: "Case open past timeout",
  expired_on_shelf: "Expired on shelf",
  bill_only_unmapped: "Unknown or unmapped barcode",
  not_on_any_contract: "Not on any contract",
};

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
  caseId: number | null;
  barcode: string | null;
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

  function updateFilter(key: keyof typeof filters, value: string) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, [key]: value })) {
      if (v) next.set(k, v);
    }
    if (!next.has("status")) next.set("status", "");
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
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
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
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th className="py-2 pr-3 font-medium">ID</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Ctr</th>
              <th className="py-2 pr-3 font-medium">Detail</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Owner</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-3">{r.id}</td>
                <td className="py-2 pr-3">{TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="py-2 pr-3">{r.sourceContainer}</td>
                <td className="py-2 pr-3">
                  {r.caseId != null ? (
                    <Link href={`/cases/${r.caseId}`} className="underline">
                      Case #{r.caseId}
                    </Link>
                  ) : r.barcode ? (
                    <span className="font-mono text-xs">{r.barcode}</span>
                  ) : r.vendorName ? (
                    `${r.vendorName} ${r.catalogNumber}`
                  ) : (
                    (r.productId ?? "—")
                  )}
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
