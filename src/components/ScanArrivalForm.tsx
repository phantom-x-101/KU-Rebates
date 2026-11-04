"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  lookupBarcodeAction,
  recordArrivalAction,
  type ArrivalActionState,
} from "@/app/scan/arrival/actions";
import {
  CARDIVA_HIBC_SAMPLE,
  TERUMO_GS1_SAMPLE,
  type ParsedBarcode,
} from "@/lib/barcode";
import type { IdentifiedProduct } from "@/lib/arrival";

type LocationOption = { id: number; name: string };

const initial: ArrivalActionState = { ok: false, message: "" };

export function ScanArrivalForm({
  locations,
  canAddProduct,
}: {
  locations: LocationOption[];
  canAddProduct: boolean;
}) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedBarcode | null>(null);
  const [product, setProduct] = useState<IdentifiedProduct | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [locationId, setLocationId] = useState(
    locations[0] ? String(locations[0].id) : "",
  );
  const [pendingLookup, startLookup] = useTransition();
  const [saveState, saveAction, savePending] = useActionState(
    recordArrivalAction,
    initial,
  );

  const needsManualLotExpiry = useMemo(() => {
    if (!parsed) return true;
    return !(parsed.lot && parsed.expiry);
  }, [parsed]);

  function applyLookup(nextRaw: string) {
    startLookup(async () => {
      setLookupError(null);
      setProduct(null);
      setParsed(null);
      try {
        const result = await lookupBarcodeAction(nextRaw);
        setParsed(result.parsed);
        if (result.parsed.lot) setLot(result.parsed.lot);
        else setLot("");
        if (result.parsed.expiry) setExpiry(result.parsed.expiry);
        else setExpiry("");
        if (!result.product) {
          setLookupError(
            `Unknown barcode — no product matched for “${nextRaw.trim()}”.`,
          );
          return;
        }
        setProduct(result.product);
      } catch (e) {
        setLookupError(e instanceof Error ? e.message : "Lookup failed");
      }
    });
  }

  const lotFromBarcode = Boolean(parsed?.lot);
  const expiryFromBarcode = Boolean(parsed?.expiry);

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Scan or type barcode</h2>
        <p className="text-sm text-slate-600">
          GS1 fills lot and expiry when present. HIBC is item-only — enter lot and
          expiry by hand.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
            onClick={() => {
              setRaw(TERUMO_GS1_SAMPLE);
              applyLookup(TERUMO_GS1_SAMPLE);
            }}
          >
            Fill Terumo GS1 sample
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
            onClick={() => {
              setRaw(CARDIVA_HIBC_SAMPLE);
              applyLookup(CARDIVA_HIBC_SAMPLE);
            }}
          >
            Fill Cardiva HIBC sample
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLookup(raw);
              }
            }}
            placeholder="Scan or paste barcode"
            className="min-w-[20rem] flex-1 rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
          />
          <button
            type="button"
            disabled={pendingLookup || !raw.trim()}
            onClick={() => applyLookup(raw)}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pendingLookup ? "Looking up…" : "Identify"}
          </button>
        </div>

        {lookupError ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p>{lookupError}</p>
            {canAddProduct ? (
              <p className="mt-1">
                <Link href="/settings/products" className="underline">
                  Add the product in Settings
                </Link>
              </p>
            ) : (
              <p className="mt-1 text-amber-800">
                Ask supply_chain or admin to add this product, then scan again.
              </p>
            )}
          </div>
        ) : null}

        {parsed ? (
          <dl className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Format</dt>
              <dd className="font-mono">{parsed.format}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Item</dt>
              <dd className="font-mono text-xs">{parsed.item ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Lot from barcode</dt>
              <dd className="font-mono">{parsed.lot ?? "— (enter manually)"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Expiry from barcode</dt>
              <dd className="font-mono">
                {parsed.expiry ?? "— (enter manually)"}
              </dd>
            </div>
          </dl>
        ) : null}

        {product ? (
          <p className="text-sm text-emerald-800">
            Matched <strong>{product.vendorName}</strong>{" "}
            <span className="font-mono">{product.catalogNumber}</span> —{" "}
            {product.description}{" "}
            <span className="text-slate-500">
              (via {product.matchedBy}={product.matchedValue})
            </span>
          </p>
        ) : null}
      </section>

      {product ? (
        <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-medium">Record arrival</h2>
          {needsManualLotExpiry ? (
            <p className="text-sm text-amber-800">
              This barcode did not carry lot and expiry. Enter them below.
            </p>
          ) : (
            <p className="text-sm text-emerald-800">
              Lot and expiry came from the GS1 barcode.
            </p>
          )}
          <form action={saveAction} className="space-y-3">
            <input type="hidden" name="rawBarcode" value={raw} />
            <input type="hidden" name="productId" value={product.productId} />
            <input
              type="hidden"
              name="barcodeFormat"
              value={parsed?.format ?? "other"}
            />
            <input
              type="hidden"
              name="lotExpirySource"
              value={lotFromBarcode && expiryFromBarcode ? "barcode" : "manual"}
            />
            <label className="block text-sm">
              <span className="text-slate-600">Lot</span>
              <input
                name="lot"
                required
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                readOnly={lotFromBarcode}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm read-only:bg-slate-50"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Expiry (YYYY-MM-DD)</span>
              <input
                name="expiry"
                required
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                readOnly={expiryFromBarcode}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm read-only:bg-slate-50"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Location</span>
              <select
                name="locationId"
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Qty</span>
              <input
                name="qty"
                type="number"
                min={1}
                defaultValue={1}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <button
              type="submit"
              disabled={savePending}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {savePending ? "Saving…" : "Save arrived stock event"}
            </button>
            {saveState.message ? (
              <p
                className={`text-sm ${saveState.ok ? "text-emerald-700" : "text-red-700"}`}
                role="status"
              >
                {saveState.message}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
    </div>
  );
}
