"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addProductAction,
  closeEpCaseAction,
  scanAction,
} from "@/app/station/actions";
import { StationOpenCase } from "@/components/StationOpenCase";
import type { CaseOpenOptions } from "@/lib/case-open";
import { LastReadPanel, type LastRead } from "@/components/LastReadPanel";
import { playScanCue } from "@/components/scan-cue";
import { ScanModeCards, type ScanSource } from "@/components/ScanModeCards";
import { useWedgeCapture } from "@/components/useWedgeCapture";
import type { DemoLabel } from "@/lib/demo-labels";
import { looksLikeTag, normalizeTag } from "@/lib/tag";
import {
  LAST_READ_MS,
  checkedOutBanner,
  itemReadBanner,
  logWedgeScan,
  returnedBanner,
} from "@/lib/wedge-buffer";
import type { CaseReconciliation } from "@/lib/reconcile";
import type { StockViewRow } from "@/lib/stock-view";
import type {
  StationMode,
  StationOutcome,
} from "@/lib/station";

type CaseRow = {
  id: number;
  status: string;
  departmentName: string;
  roomName: string | null;
  procedureTypeName: string | null;
  preview: boolean;
};

type Line = {
  productId: number;
  lot: string | null;
  expiry: string | null;
  description: string;
  catalogNumber: string;
  pulled: number;
  returned: number;
  remaining: number;
};

type Vendor = { id: number; name: string };

const MODE_LABEL: Record<StationMode, string> = {
  arrive: "Check in",
  use: "Check out",
  return: "Return",
};

const MODE_KEY = "ku-station-mode";

function cue(outcome: StationOutcome) {
  if (outcome.status === "success" || outcome.status === "needs_lot") playScanCue(true);
  else if (outcome.status === "error" || outcome.status === "unknown") playScanCue(false);
}

export function ScanStation({
  caseRow,
  reconciliation,
  lines,
  stock,
  vendors,
  simulate,
  caseOptions,
  allowedModes,
  showCasePanel = true,
  allowAddProduct = true,
  softTrigger = false,
  scanDebug = false,
}: {
  caseRow: CaseRow | null;
  reconciliation: CaseReconciliation | null;
  lines: Line[];
  stock: StockViewRow[];
  vendors: Vendor[];
  simulate: DemoLabel[];
  caseOptions: CaseOpenOptions;
  allowedModes: StationMode[];
  showCasePanel?: boolean;
  allowAddProduct?: boolean;
  softTrigger?: boolean;
  scanDebug?: boolean;
}) {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const lastTag = useRef<{ tag: string; at: number } | null>(null);
  const [mode, setMode] = useState<StationMode>(allowedModes[0] ?? "use");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<StationOutcome | null>(null);
  const [closeNote, setCloseNote] = useState<{
    closed: boolean;
    message: string;
  } | null>(null);
  const [sim, setSim] = useState("");
  const [source, setSource] = useState<ScanSource>("rfid");
  const [typeManually, setTypeManually] = useState(false);
  const [lastRead, setLastRead] = useState<LastRead | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; title: string } | null>(null);
  const [arrivals, setArrivals] = useState<
    {
      id: number;
      description: string;
      vendorName: string;
      catalogNumber: string;
      lot: string | null;
      expiry: string | null;
    }[]
  >([]);

  function rememberArrival(outcome: StationOutcome) {
    if (outcome.status !== "success" || outcome.mode !== "arrive") return;
    const item = outcome.item;
    setArrivals((prev) =>
      [
        {
          id: Date.now(),
          description: item.description,
          vendorName: item.vendorName,
          catalogNumber: item.catalogNumber,
          lot: item.lot,
          expiry: item.expiry,
        },
        ...prev,
      ].slice(0, 4),
    );
  }

  useEffect(() => {
    if (allowedModes.includes("use")) {
      setMode("use");
      return;
    }
    const saved = sessionStorage.getItem(MODE_KEY);
    const mapped = saved === "pull" ? "use" : saved;
    setMode((current) => {
      if (mapped && allowedModes.includes(mapped as StationMode)) {
        return mapped as StationMode;
      }
      if (!allowedModes.includes(current)) {
        return allowedModes[0] ?? "use";
      }
      return current;
    });
  }, [allowedModes]);

  useEffect(() => {
    sessionStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (!lastRead) return;
    const timer = window.setTimeout(() => setLastRead(null), LAST_READ_MS);
    return () => window.clearTimeout(timer);
  }, [lastRead]);

  function recordRead(kind: LastRead["kind"], raw: string, detail: string, title: string, ok: boolean) {
    setLastRead({ raw, at: Date.now(), kind, detail });
    setBanner({ ok, title });
  }

  async function submit(raw: string, extra?: { lot?: string; expiry?: string }) {
    const value = raw.replace(/\u0000/g, "").trim();
    if (!value || busy.current) return;
    logWedgeScan(value);
    if (looksLikeTag(value)) {
      const tag = normalizeTag(value);
      const now = Date.now();
      if (
        tag &&
        lastTag.current &&
        lastTag.current.tag === tag &&
        now - lastTag.current.at < 2000
      ) {
        return;
      }
      if (tag) lastTag.current = { tag, at: now };
    }
    busy.current = true;
    setPending(true);
    setCloseNote(null);
    // A lot-and-expiry label attaches to the item still waiting for its lot.
    const pendingRaw =
      !extra && result?.status === "needs_lot" ? result.raw : null;
    try {
      const outcome = await scanAction({
        mode,
        rawBarcode: value,
        caseId: caseRow?.id ?? null,
        lot: extra?.lot,
        expiry: extra?.expiry,
        pendingRaw,
      });
      setResult(outcome);
      rememberArrival(outcome);
      cue(outcome);
      if (outcome.status === "needs_lot") {
        setSource("barcode");
        recordRead(
          "item_recognised",
          value,
          outcome.product.description,
          itemReadBanner(outcome.product.description),
          true,
        );
      }
      if (outcome.status === "success") {
        setSource("rfid");
        if (outcome.mode === "return") {
          recordRead(
            "returned",
            value,
            outcome.item.description,
            returnedBanner(outcome.item.description),
            true,
          );
        } else {
          recordRead(
            "checked_out",
            value,
            outcome.item.description,
            checkedOutBanner(outcome.item.description),
            true,
          );
        }
      }
      if (outcome.status === "unknown") {
        recordRead("unknown", value, outcome.message, outcome.message, false);
      }
      if (outcome.status === "error") {
        recordRead("rejected", value, outcome.message, outcome.message, false);
      }
      if (scanRef.current) scanRef.current.value = "";
      setSim("");
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const buffer = useWedgeCapture({
    active: !typeManually,
    paused: pending,
    scanRef,
    onScan: (value) => void submit(value),
  });

  function goToCase(caseId: number) {
    setResult(null);
    setCloseNote(null);
    router.push(`/station?case=${caseId}`);
  }

  async function closeCase() {
    if (!caseRow || caseRow.status !== "open" || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const closed = await closeEpCaseAction(caseRow.id);
      setCloseNote({ closed: closed.closed, message: closed.message });
      setResult(null);
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const involved = new Set(lines.map((line) => line.productId));
  const tally = reconciliation;
  const caseOpen = caseRow?.status === "open";
  const caseTitle = caseRow
    ? [caseRow.departmentName, caseRow.roomName, caseRow.procedureTypeName]
        .filter(Boolean)
        .join(" · ")
    : "No case open";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.45fr_1fr]">
      <section className="space-y-4">
        <div className={`grid gap-2 ${allowedModes.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {allowedModes.map((id) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`rounded-xl px-3 py-4 text-lg font-bold uppercase tracking-wide ${
                  active
                    ? "bg-pc-teal text-white"
                    : "border border-slate-300 bg-white text-slate-800"
                }`}
              >
                {MODE_LABEL[id]}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-300 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Current mode
          </p>
          <p className="text-2xl font-bold uppercase">{MODE_LABEL[mode]}</p>
          {showCasePanel ? (
            <>
          <div className="mt-2 border-t border-slate-200 pt-2">
            <p className="text-xl font-bold text-slate-900">
              {caseTitle}
              {caseRow?.preview ? (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-semibold uppercase text-amber-900">
                  preview
                </span>
              ) : null}
            </p>
            {caseRow ? (
              <p className="text-sm text-slate-600">
                Case #{caseRow.id} · {caseRow.status}
              </p>
            ) : null}
          </div>
          {caseOpen ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void closeCase()}
                disabled={pending}
                className="rounded-lg border border-pc-teal bg-white px-4 py-2 text-sm font-semibold text-pc-teal disabled:opacity-40"
              >
                Close case
              </button>
              <button
                type="button"
                onClick={() => router.push("/station")}
                className="text-sm font-medium text-slate-600 underline"
              >
                Open a different case
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <StationOpenCase
                options={caseOptions}
                disabled={pending}
                onOpened={goToCase}
              />
            </div>
          )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Scan your own products onto KU's shelf. Item barcode, then lot and expiry.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-xl border bg-white p-4">
        <LastReadPanel
          lastRead={lastRead}
          reading={buffer}
          debugBuffer={scanDebug ? buffer : null}
        />
        {banner ? (
          <div
            className={`rounded-2xl px-4 py-4 text-white ${
              banner.ok ? "bg-emerald-700" : "bg-red-700"
            }`}
            aria-live="polite"
          >
            <p className="text-3xl font-bold">{banner.title}</p>
          </div>
        ) : null}
        {showCasePanel ? (
          <ScanModeCards
            first="rfid"
            selected={source}
            completed={{
              barcode: Boolean(result?.status === "success" && !result.tagDisplay),
            }}
            onSelect={setSource}
            scanRef={scanRef}
            onSubmit={() => void submit(scanRef.current?.value ?? "")}
            disabled={pending}
            softTrigger={softTrigger}
            hideSecond
            onTypeManuallyChange={setTypeManually}
          />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(scanRef.current?.value ?? "");
            }}
          >
            <input
              id="station-scan"
              ref={scanRef}
              autoComplete="off"
              inputMode="none"
              enterKeyHint="done"
              className="sr-only"
            />
          </form>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(sim);
          }}
        >
          <label className="min-w-[16rem] flex-1 text-sm">
            <span className="font-semibold text-slate-700">Simulate scan</span>
            <input
              data-keep-focus
              value={sim}
              onChange={(event) => setSim(event.target.value)}
              placeholder="Type a barcode or tag ID"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold"
          >
            Simulate
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {simulate.map((label) => (
            <button
              key={label.id}
              type="button"
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800"
              onClick={() => {
                setSource("barcode");
                void submit(label.barcode);
              }}
            >
              {label.title}
            </button>
          ))}
        </div>
        </div>

        {pending ? (
          <p className="text-sm font-medium text-slate-600">Reading scan…</p>
        ) : null}

        <ResultCard result={result} />

        {result?.status === "needs_lot" ? (
          <form
            key={`${result.raw}-${mode}-${result.lots.length}`}
            data-keep-focus
            className="space-y-3 rounded-xl border border-amber-400 bg-amber-50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const picked = result.lots[Number(data.get("lotIndex") ?? -1)];
              void submit(
                result.raw,
                picked
                  ? { lot: picked.lot, expiry: picked.expiry }
                  : {
                      lot: String(data.get("lot") ?? ""),
                      expiry: String(data.get("expiry") ?? ""),
                    },
              );
            }}
          >
            <p className="font-semibold text-amber-950">{result.message}</p>
            <p className="text-sm text-amber-950">
              {result.product.vendorName} · {result.product.description} ·{" "}
              {result.product.catalogNumber}
              {result.product.hospitalOwned ? " · hospital-owned" : ""}
            </p>
            <ScanReads reads={result.reads} className="text-amber-900" />
            <div className="flex flex-wrap gap-3">
              {result.lots.length > 0 ? (
                <label className="text-sm">
                  {mode === "return" ? "Lot out on this case" : "Lot on hand"}
                  <select
                    name="lotIndex"
                    defaultValue={0}
                    className="mt-1 block rounded border border-slate-300 px-2 py-1 font-mono"
                  >
                    {result.lots.map((lot, index) => (
                      <option
                        key={`${lot.lot}-${lot.expiry}-${lot.locationId}`}
                        value={index}
                      >
                        {lot.lot} · exp {lot.expiry} · {lot.onHand}{" "}
                        {mode === "return" ? "out" : "on hand"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="text-sm">
                    Lot
                    <input
                      name="lot"
                      required
                      defaultValue={result.suggestedLot}
                      className="mt-1 block rounded border border-slate-300 px-2 py-1"
                    />
                  </label>
                  <label className="text-sm">
                    Expiry
                    <input
                      name="expiry"
                      type="date"
                      required
                      defaultValue={result.suggestedExpiry}
                      className="mt-1 block rounded border border-slate-300 px-2 py-1"
                    />
                  </label>
                </>
              )}
              <button
                type="submit"
                className="self-end rounded-lg bg-pc-teal px-3 py-2 text-sm font-semibold text-white"
              >
                Confirm lot
              </button>
            </div>
          </form>
        ) : null}

        {result?.status === "unknown" && allowAddProduct ? (
          <form
            data-keep-focus
            className="space-y-3 rounded-xl border border-red-300 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void (async () => {
                if (busy.current) return;
                busy.current = true;
                setPending(true);
                try {
                  const outcome = await addProductAction({
                    vendorId: Number(data.get("vendorId")),
                    description: String(data.get("description") ?? ""),
                    catalogNumber: String(data.get("catalogNumber") ?? ""),
                    parLevel: Number(data.get("parLevel") ?? 0),
                    rawBarcode: result.raw,
                    mode,
                    caseId: caseRow?.id ?? null,
                    lot: String(data.get("lot") ?? ""),
                    expiry: String(data.get("expiry") ?? ""),
                  });
                  setResult(outcome);
                  rememberArrival(outcome);
                  cue(outcome);
                  router.refresh();
                } finally {
                  busy.current = false;
                  setPending(false);
                }
              })();
            }}
          >
            <p className="text-lg font-bold text-red-800">Add this product now</p>
            <p className="font-mono text-sm text-slate-700">{result.raw}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Vendor
                <select
                  name="vendorId"
                  required
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
                  defaultValue={vendors[0]?.id ?? ""}
                >
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Name
                <input
                  name="description"
                  required
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-sm">
                Catalog number
                <input
                  name="catalogNumber"
                  required
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-sm">
                Par level
                <input
                  name="parLevel"
                  type="number"
                  min={0}
                  required
                  defaultValue={2}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-sm">
                Lot
                <input
                  name="lot"
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-sm">
                Expiry
                <input
                  name="expiry"
                  type="date"
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-pc-teal px-3 py-2 text-sm font-semibold text-white"
            >
              Save product
            </button>
          </form>
        ) : null}

        {closeNote ? (
          <div
            className={`rounded-xl px-5 py-4 text-white ${
              closeNote.closed ? "bg-emerald-700" : "bg-red-700"
            }`}
          >
            <p className="text-2xl font-bold">
              {closeNote.closed ? "Case closed" : "Could not close"}
            </p>
            <p className="mt-1 text-lg">{closeNote.message}</p>
          </div>
        ) : null}
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-bold">Case check</h2>
          {tally ? (
            <>
              <p className="mt-2 text-4xl font-bold tabular-nums">
                {tally.taken}
                <span className="ml-2 text-base font-semibold text-slate-500">used</span>
              </p>
              <p className="mt-1 text-lg tabular-nums text-slate-800">
                {tally.returned} returned
              </p>
              {tally.taken === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Check starts once items are used.
                </p>
              ) : caseOpen ? (
                <p className="mt-3 text-lg font-semibold text-slate-800">
                  {tally.used} used · KU pays at scan. Return to net it out.
                </p>
              ) : (
                <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
                  <p className="text-lg font-bold">Used (KU paid): {tally.used}</p>
                  <p className="text-lg font-bold">Returned (netted out): {tally.returned}</p>
                </div>
              )}
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {lines.map((line) => (
                  <li key={`${line.productId}-${line.lot}-${line.expiry}`}>
                    {line.description}{" "}
                    <span className="font-mono text-xs">{line.lot}</span> · used{" "}
                    {line.pulled} · returned {line.returned}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Open a case to check out or return.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-bold">On hand</h2>
          <ul className="mt-2 max-h-96 divide-y divide-slate-200 overflow-y-auto overscroll-contain pr-1">
            {stock.map((row) => {
              const hot = involved.has(row.productId);
              return (
                <li
                  key={`${row.productId}-${row.locationId}-${row.lot}-${row.expiry}`}
                  className={`flex items-baseline justify-between gap-3 py-2 ${
                    hot ? "bg-emerald-50" : ""
                  }`}
                >
                  <div>
                    <p className="font-medium leading-tight">
                      {row.description}
                    </p>
                    <p className="font-mono text-xs text-slate-500">
                      {row.catalogNumber} · {row.lot} · {row.expiry}
                      {row.hospitalOwned ? " · hospital-owned" : ""}
                      {row.flag === "expired"
                        ? " · expired"
                        : row.flag === "expiring_soon"
                          ? " · expiring"
                          : ""}
                    </p>
                  </div>
                  <p className="text-3xl font-bold tabular-nums">{row.onHand}</p>
                </li>
              );
            })}
            {stock.length === 0 ? (
              <li className="py-2 text-sm text-slate-500">Shelf is empty.</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-300 bg-white p-3">
          <h2 className="text-sm font-bold">Just checked in</h2>
          {arrivals.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              New shelf scans show here.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {arrivals.map((item, index) => (
                <li key={item.id} className="text-sm leading-tight">
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-slate-600">
                    {item.catalogNumber}
                    {item.lot ? ` · lot ${item.lot}` : ""}
                    {index === 0 ? " · just added" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function ResultCard({ result }: { result: StationOutcome | null }) {
  if (!result || result.status === "needs_lot") return null;
  if (result.status === "unknown") {
    return (
      <div className="rounded-xl bg-red-700 px-5 py-6 text-white shadow-lg" aria-live="polite">
        <p className="text-4xl font-bold">{result.message}</p>
        <p className="mt-1 font-mono text-lg">{result.raw}</p>
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="rounded-xl bg-red-700 px-5 py-6 text-white shadow-lg" aria-live="polite">
        <p className="text-4xl font-bold">{result.message}</p>
        {result.item ? (
          <p className="mt-2 text-lg">
            {result.item.vendorName} · {result.item.description}
            {result.item.lot ? ` · lot ${result.item.lot}` : ""}
            {result.item.expiry ? ` · exp ${result.item.expiry}` : ""}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-emerald-700 px-5 py-6 text-white shadow-lg" aria-live="polite">
      <p className="text-4xl font-bold">{result.headline}</p>
      <p className="mt-2 text-xl">{result.item.description}</p>
      <p className="text-lg">
        {result.item.vendorName} · {result.item.catalogNumber}
        {result.item.hospitalOwned ? " · hospital-owned" : ""}
      </p>
      <p className="mt-1 text-lg">
        Lot {result.item.lot} · exp {result.item.expiry} · qty {result.item.qty}
        {result.tagDisplay ? ` · tag ${result.tagDisplay}` : ""}
      </p>
      {result.notice ? (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-lg font-semibold text-amber-950">
          {result.notice}
        </p>
      ) : null}
      <ScanReads reads={result.reads} className="mt-3 text-emerald-50" />
    </div>
  );
}

function ScanReads({ reads, className }: { reads: string[]; className: string }) {
  if (reads.length === 0) return null;
  return (
    <ul className={`space-y-0.5 font-mono text-xs ${className}`}>
      {reads.map((read, index) => (
        <li key={index}>Read: {read}</li>
      ))}
    </ul>
  );
}
