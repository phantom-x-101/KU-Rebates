"use client";

import { LAST_READ_LABEL, type LastReadKind } from "@/lib/wedge-buffer";

export type LastRead = {
  raw: string;
  at: number;
  kind: LastReadKind;
  detail: string;
};

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LastReadPanel({
  lastRead,
  reading,
  debugBuffer,
}: {
  lastRead: LastRead | null;
  reading?: string;
  debugBuffer?: string | null;
}) {
  if (!lastRead && !reading && debugBuffer == null) return null;
  const rejected =
    lastRead?.kind === "rejected" || lastRead?.kind === "unknown";

  return (
    <div className="space-y-2">
      {reading ? (
        <p
          className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2 text-[#16323c]"
          aria-live="polite"
        >
          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Reading…
          </span>
          <span className="break-all font-mono text-base">{reading}</span>
        </p>
      ) : null}
      {lastRead ? (
        <div
          className={`rounded-2xl border-2 px-4 py-3 ${
            rejected
              ? "border-red-400 bg-red-50"
              : "border-emerald-400 bg-emerald-50"
          }`}
          aria-live="polite"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last read · {clock(lastRead.at)}
          </p>
          <p className="mt-1 break-all font-mono text-base text-[#16323c]">
            {lastRead.raw}
          </p>
          <p className="mt-1 text-lg font-bold text-[#16323c]">
            {LAST_READ_LABEL[lastRead.kind]}
            {lastRead.detail ? ` · ${lastRead.detail}` : ""}
          </p>
        </div>
      ) : null}
      {debugBuffer != null ? (
        <p className="rounded-xl border border-dashed border-slate-400 bg-white px-3 py-2 font-mono text-sm text-slate-700">
          Buffer: {debugBuffer || "·"}
        </p>
      ) : null}
    </div>
  );
}
