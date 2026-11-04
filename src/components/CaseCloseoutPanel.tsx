"use client";

import { useActionState, useState, useTransition } from "react";
import {
  abortCaseAction,
  closeCaseAction,
  closeoutAction,
  type CaseActionState,
} from "@/app/cases/actions";

export type PullLine = {
  productId: number;
  lot: string | null;
  expiry: string | null;
  locationId: number | null;
  catalogNumber: string;
  description: string;
  vendorName: string;
  pulled: number;
  returned: number;
  used: number;
  wasted: number;
  remaining: number;
};

const initial: CaseActionState = { ok: false, message: "" };

function CloseoutButtons({
  caseId,
  line,
}: {
  caseId: number;
  line: PullLine;
}) {
  const [state, action, pending] = useActionState(closeoutAction, initial);
  if (line.remaining <= 0) {
    return <span className="text-xs text-slate-500">Closed out</span>;
  }

  return (
    <div className="space-y-1">
      <form action={action} className="flex flex-wrap gap-1">
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="productId" value={line.productId} />
        <input type="hidden" name="lot" value={line.lot ?? ""} />
        <input type="hidden" name="expiry" value={line.expiry ?? ""} />
        <input type="hidden" name="locationId" value={line.locationId ?? ""} />
        <input type="hidden" name="qty" value={1} />
        <button
          name="disposition"
          value="used"
          disabled={pending}
          className="rounded bg-emerald-800 px-2 py-0.5 text-xs text-white disabled:opacity-60"
        >
          Used
        </button>
        <button
          name="disposition"
          value="wasted"
          disabled={pending}
          className="rounded bg-amber-700 px-2 py-0.5 text-xs text-white disabled:opacity-60"
        >
          Wasted
        </button>
        <button
          name="disposition"
          value="returned"
          disabled={pending}
          className="rounded bg-slate-700 px-2 py-0.5 text-xs text-white disabled:opacity-60"
        >
          Returned
        </button>
      </form>
      {state.message ? (
        <p
          className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function CaseCloseoutPanel({
  caseId,
  status,
  lines,
}: {
  caseId: number;
  status: string;
  lines: PullLine[];
}) {
  const [msg, setMsg] = useState("");
  const [, start] = useTransition();

  return (
    <div className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium">Close-out</h2>
      <p className="text-sm text-slate-600">
        Mark each pulled item used, wasted, or returned. Wasted opens an{" "}
        <code>opened_or_wasted</code> exception. Returned puts stock back on hand.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Lot</th>
              <th className="py-2 pr-3 font-medium">Pulled</th>
              <th className="py-2 pr-3 font-medium">Used</th>
              <th className="py-2 pr-3 font-medium">Wasted</th>
              <th className="py-2 pr-3 font-medium">Returned</th>
              <th className="py-2 pr-3 font-medium">Left</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr
                key={`${l.productId}-${l.lot}-${l.expiry}-${l.locationId}`}
                className="border-b border-slate-200 align-top"
              >
                <td className="py-2 pr-3">
                  {l.vendorName} {l.catalogNumber}
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{l.lot ?? "—"}</td>
                <td className="py-2 pr-3">{l.pulled}</td>
                <td className="py-2 pr-3">{l.used}</td>
                <td className="py-2 pr-3">{l.wasted}</td>
                <td className="py-2 pr-3">{l.returned}</td>
                <td className="py-2 pr-3 font-semibold">{l.remaining}</td>
                <td className="py-2">
                  {status === "open" ? (
                    <CloseoutButtons caseId={caseId} line={l} />
                  ) : (
                    <span className="text-xs text-slate-500">{status}</span>
                  )}
                </td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-3 text-slate-500">
                  No pulls yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {status === "open" ? (
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
            onClick={() =>
              start(async () => {
                const r = await closeCaseAction(caseId);
                setMsg(r.message);
              })
            }
          >
            Close case
          </button>
          <button
            type="button"
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-800"
            onClick={() =>
              start(async () => {
                const r = await abortCaseAction(caseId);
                setMsg(r.message);
              })
            }
          >
            Abort case
          </button>
          {msg ? <p className="w-full text-sm text-slate-700">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
