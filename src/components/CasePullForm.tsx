"use client";

import { useActionState, useState, useTransition } from "react";
import {
  lookupPullBarcodeAction,
  recordPullAction,
  type CaseActionState,
} from "@/app/cases/actions";
import {
  CARDIVA_HIBC_SAMPLE,
  TERUMO_GS1_SAMPLE,
  isLotExpiryOnly,
  pairLotScan,
  parseBarcode,
  type ParsedBarcode,
} from "@/lib/barcode";
import type { IdentifiedProduct } from "@/lib/arrival";
import { CARDIVA_VASCADE, hibcSecondaryLabel } from "@/lib/real-products";
import type { PullableLot } from "@/lib/stock";

const CARDIVA_LOT_LABEL = hibcSecondaryLabel(CARDIVA_VASCADE);

type Loc = { id: number; name: string };

const initial: CaseActionState = { ok: false, message: "" };

export function CasePullForm({
  caseId,
  locations,
}: {
  caseId: number;
  locations: Loc[];
}) {
  const [raw, setRaw] = useState("");
  const [itemRaw, setItemRaw] = useState("");
  const [lotScanned, setLotScanned] = useState(false);
  const [parsed, setParsed] = useState<ParsedBarcode | null>(null);
  const [product, setProduct] = useState<IdentifiedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [lots, setLots] = useState<PullableLot[]>([]);
  const [lotIndex, setLotIndex] = useState(0);
  const [locationId, setLocationId] = useState(
    locations[0] ? String(locations[0].id) : "",
  );
  const [pendingLookup, startLookup] = useTransition();
  const [state, action, pending] = useActionState(recordPullAction, initial);
  const picked = lots[lotIndex] ?? null;

  function applyLotScan(next: string) {
    const scan = parseBarcode(next);
    if (!product) {
      setError("Scan the item barcode first. This label has only lot and expiry.");
      return;
    }
    const pair = pairLotScan(itemRaw, scan);
    if (!pair.ok) {
      setError(pair.message);
      return;
    }
    setRaw("");
    setLotScanned(true);
    const index = lots.findIndex(
      (row) => row.lot === pair.lot && (!pair.expiry || row.expiry === pair.expiry),
    );
    if (index >= 0) {
      setLotIndex(index);
      return;
    }
    setLots([]);
    setLot(pair.lot ?? "");
    setExpiry(pair.expiry ?? "");
    setError("That lot is not on hand here. Pick a location, or leave it as brought in.");
  }

  function lookup(next: string) {
    setError(null);
    if (isLotExpiryOnly(parseBarcode(next))) {
      applyLotScan(next);
      return;
    }
    startLookup(async () => {
      setProduct(null);
      setParsed(null);
      setLots([]);
      setLotIndex(0);
      setLotScanned(false);
      setItemRaw(next.trim());
      try {
        const result = await lookupPullBarcodeAction(next);
        setParsed(result.parsed);
        setLot(result.parsed.lot ?? "");
        setExpiry(result.parsed.expiry ?? "");
        if (!result.product) {
          setError(`Unknown barcode “${next.trim()}”. Added to the exception queue.`);
          return;
        }
        setProduct(result.product);
        setLots(result.lots);
        if (
          result.lots.length === 0 &&
          !(result.parsed.lot && result.parsed.expiry)
        ) {
          setError(
            "Nothing on hand for this product. For a brought-in item, enter lot and expiry.",
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lookup failed");
      }
    });
  }

  return (
    <div className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium">Scan when pulled</h2>
      <p className="text-sm text-slate-600">
        Items can come from any location, including brought-in (leave location
        empty).
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1"
          onClick={() => {
            setRaw(TERUMO_GS1_SAMPLE);
            lookup(TERUMO_GS1_SAMPLE);
          }}
        >
          Terumo 8 Fr GS1
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1"
          onClick={() => {
            setRaw(CARDIVA_HIBC_SAMPLE);
            lookup(CARDIVA_HIBC_SAMPLE);
          }}
        >
          Cardiva HIBC item
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1"
          onClick={() => lookup(CARDIVA_LOT_LABEL)}
        >
          Cardiva lot label
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1"
          onClick={() => {
            setRaw("RSS106");
            lookup("RSS106");
          }}
        >
          Terumo 11 Fr catalog
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lookup(raw);
            }
          }}
          className="min-w-[16rem] flex-1 rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
          placeholder="Scan or type barcode / catalog"
        />
        <button
          type="button"
          disabled={pendingLookup || !raw.trim()}
          onClick={() => lookup(raw)}
          className="rounded bg-pc-teal px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {pendingLookup ? "…" : "Identify"}
        </button>
      </div>
      {error ? <p className="text-sm text-amber-800">{error}</p> : null}
      {product ? (
        <p className="text-sm text-emerald-800">
          {product.vendorName} {product.catalogNumber} — {product.description}
        </p>
      ) : null}

      {product ? (
        <form action={action} className="space-y-3 border-t border-slate-100 pt-3">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="rawBarcode" value={itemRaw} />
          <input type="hidden" name="productId" value={product.productId} />
          <input
            type="hidden"
            name="barcodeFormat"
            value={parsed?.format ?? "other"}
          />
          <input
            type="hidden"
            name="lotExpirySource"
            value={(parsed?.lot && parsed?.expiry) || lotScanned ? "barcode" : "manual"}
          />
          {picked ? (
            <>
              <label className="block text-sm">
                <span className="text-slate-600">Lot on hand (earliest expiry first)</span>
                <select
                  value={lotIndex}
                  onChange={(e) => setLotIndex(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
                >
                  {lots.map((row, index) => (
                    <option
                      key={`${row.lot}-${row.expiry}-${row.locationId}`}
                      value={index}
                    >
                      {row.lot} · exp {row.expiry} · {row.onHand} on hand
                      {row.locationId != null
                        ? ` · ${locations.find((l) => l.id === row.locationId)?.name ?? ""}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="lot" value={picked.lot} />
              <input type="hidden" name="expiry" value={picked.expiry} />
              <input type="hidden" name="locationId" value={picked.locationId ?? ""} />
            </>
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-slate-600">Lot</span>
                <input
                  name="lot"
                  required
                  value={lot}
                  onChange={(e) => setLot(e.target.value)}
                  readOnly={Boolean(parsed?.lot)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm read-only:bg-slate-50"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Expiry</span>
                <input
                  name="expiry"
                  type="date"
                  required
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  readOnly={Boolean(parsed?.expiry)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm read-only:bg-slate-50"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Location (optional / brought-in)</span>
                <select
                  name="locationId"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                >
                  <option value="">Brought in (no shelf location)</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
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
            disabled={pending}
            className="rounded bg-pc-teal px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Record pull"}
          </button>
          {state.message ? (
            <p
              className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}
            >
              {state.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
