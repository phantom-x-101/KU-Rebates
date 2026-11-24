"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkInTagAction,
  identifyCheckInAction,
  unlinkUnitAction,
} from "@/app/vendor/check-in/actions";
import { LastReadPanel, type LastRead } from "@/components/LastReadPanel";
import { playScanCue } from "@/components/scan-cue";
import { ScanModeCards, type ScanSource } from "@/components/ScanModeCards";
import { useWedgeCapture } from "@/components/useWedgeCapture";
import { normalizeTag, shortTag } from "@/lib/tag";
import type { CheckInIdentifyResult, CheckInProduct, TaggedUnit } from "@/lib/units";
import {
  LAST_READ_MS,
  itemReadBanner,
  logWedgeScan,
  lotReadBanner,
  tagLinkedBanner,
} from "@/lib/wedge-buffer";

type Flash = {
  ok: boolean;
  title: string;
  detail: string;
};

function linkedClock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CheckInStation({
  vendorName,
  linked,
  softTrigger = false,
  scanDebug = false,
}: {
  vendorName: string;
  linked: TaggedUnit[];
  softTrigger?: boolean;
  scanDebug?: boolean;
}) {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const lastTag = useRef<{ tag: string; at: number } | null>(null);
  const [source, setSource] = useState<ScanSource>("barcode");
  const [pendingProduct, setPendingProduct] = useState<CheckInProduct | null>(null);
  const [identify, setIdentify] = useState<CheckInIdentifyResult | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [working, setWorking] = useState(false);
  const [typeManually, setTypeManually] = useState(false);
  const [lastRead, setLastRead] = useState<LastRead | null>(null);

  useEffect(() => {
    if (!lastRead) return;
    const timer = window.setTimeout(() => setLastRead(null), LAST_READ_MS);
    return () => window.clearTimeout(timer);
  }, [lastRead]);

  function note(kind: LastRead["kind"], raw: string, detail: string, ok: boolean, title: string) {
    setLastRead({ raw, at: Date.now(), kind, detail });
    setFlash({ ok, title, detail });
    playScanCue(ok);
  }

  function acceptTag(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return true;
    const now = Date.now();
    if (lastTag.current && lastTag.current.tag === tag && now - lastTag.current.at < 2000) {
      return false;
    }
    lastTag.current = { tag, at: now };
    return true;
  }

  async function linkTag(value: string, product: CheckInProduct) {
    if (!acceptTag(value)) return;
    const result = await checkInTagAction({
      tagRaw: value,
      productId: product.productId,
      lot: product.lot,
      expiry: product.expiry,
    });
    if (result.ok) {
      const unit = result.unit;
      note(
        "tag_linked",
        value,
        unit.tagDisplay,
        true,
        tagLinkedBanner(unit.tagDisplay),
      );
      setPendingProduct(null);
      setIdentify(null);
      setSource("barcode");
    } else {
      note("rejected", value, result.message, false, result.message);
    }
    router.refresh();
  }

  async function submit(raw: string, extra?: { lot?: string; expiry?: string }) {
    const value = raw.replace(/\u0000/g, "").trim();
    if (!value || busy.current) return;
    logWedgeScan(value);
    busy.current = true;
    setWorking(true);
    try {
      if (source === "rfid" && !pendingProduct && extra == null) {
        note("rejected", value, "Scan the product barcode first.", false, "Scan the product barcode first.");
        return;
      }
      if (pendingProduct && source === "rfid") {
        await linkTag(value, pendingProduct);
        return;
      }

      const outcome = await identifyCheckInAction({
        raw: value,
        pendingRaw: identify?.status === "needs_lot" ? identify.raw : null,
        lot: extra?.lot,
        expiry: extra?.expiry,
      });
      setIdentify(outcome);
      if (outcome.status === "ready") {
        setPendingProduct(outcome.product);
        setSource("rfid");
        note(
          "lot_recognised",
          value,
          outcome.product.lot,
          true,
          lotReadBanner(outcome.product.lot),
        );
      } else if (outcome.status === "needs_lot") {
        note(
          "item_recognised",
          value,
          outcome.product.description,
          true,
          itemReadBanner(outcome.product.description),
        );
      } else if (outcome.status === "unknown") {
        note("unknown", value, outcome.message, false, outcome.message);
      } else {
        note("rejected", value, outcome.message, false, outcome.message);
      }
    } finally {
      busy.current = false;
      setWorking(false);
      if (scanRef.current) scanRef.current.value = "";
    }
  }

  const buffer = useWedgeCapture({
    active: !typeManually,
    paused: working,
    scanRef,
    onScan: (value) => void submit(value),
  });

  async function unlink(id: number) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      const result = await unlinkUnitAction(id);
      setFlash({
        ok: result.ok,
        title: result.ok ? "Unlinked" : result.message,
        detail: result.ok ? `${result.unit.description} · ${shortTag(result.unit.tagEpc)}` : "",
      });
      playScanCue(result.ok);
      router.refresh();
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  const barcodeComplete = pendingProduct != null;

  return (
    <div className="space-y-5">
      <LastReadPanel
        lastRead={lastRead}
        reading={buffer}
        debugBuffer={scanDebug ? buffer : null}
      />

      <div
        className={`rounded-2xl border-4 px-5 py-5 ${
          flash?.ok
            ? "border-emerald-600 bg-emerald-50"
            : flash
              ? "border-red-700 bg-red-50"
              : "border-slate-200 bg-white"
        }`}
        aria-live="polite"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {pendingProduct ? "Scan RFID to link" : identify?.status === "needs_lot" ? "Scan lot" : "Check in"}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#16323c]">{vendorName}</p>
        {pendingProduct ? (
          <p className="mt-2 text-lg text-slate-800">
            {pendingProduct.description}
            <span className="mt-1 block font-mono text-base text-slate-600">
              {pendingProduct.catalogNumber} · lot {pendingProduct.lot} · exp{" "}
              {pendingProduct.expiry}
            </span>
          </p>
        ) : identify?.status === "needs_lot" ? (
          <p className="mt-2 text-lg text-slate-800">{identify.product.description}</p>
        ) : (
          <p className="mt-2 text-lg text-slate-700">
            Scan the product barcode (item, then lot), then scan the tag.
          </p>
        )}
        {flash ? (
          <div
            className={`mt-4 rounded-2xl px-4 py-4 text-white ${
              flash.ok ? "bg-emerald-700" : "bg-red-700"
            }`}
          >
            <p className="text-3xl font-bold">{flash.title}</p>
            {flash.detail && flash.detail !== flash.title ? (
              <p className="mt-1 text-lg">{flash.detail}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <ScanModeCards
        first="barcode"
        selected={source}
        completed={{ barcode: barcodeComplete }}
        onSelect={setSource}
        scanRef={scanRef}
        onSubmit={() => void submit(scanRef.current?.value ?? "")}
        disabled={working}
        rfidReady={pendingProduct != null}
        softTrigger={softTrigger}
        onTypeManuallyChange={setTypeManually}
      />

      {identify?.status === "needs_lot" ? (
        <form
          data-keep-focus
          className="space-y-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void submit(identify.raw, {
              lot: String(data.get("lot") ?? ""),
              expiry: String(data.get("expiry") ?? ""),
            });
          }}
        >
          <p className="text-lg font-bold">Enter lot and expiry</p>
          <label className="block text-base font-semibold">
            Lot
            <input
              name="lot"
              className="mt-1 w-full rounded-xl border border-slate-400 px-3 py-3 text-xl"
            />
          </label>
          <label className="block text-base font-semibold">
            Expiry
            <input
              name="expiry"
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-400 px-3 py-3 text-xl"
            />
          </label>
          <button
            type="submit"
            className="min-h-14 w-full rounded-2xl bg-pc-teal text-xl font-bold text-white"
          >
            Continue
          </button>
        </form>
      ) : null}

      {pendingProduct ? (
        <button
          type="button"
          onClick={() => {
            setPendingProduct(null);
            setIdentify(null);
            setFlash(null);
            setSource("barcode");
          }}
          className="min-h-12 text-base font-semibold underline"
        >
          Cancel this product
        </button>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-xl font-bold">Linked units</h2>
        <ul className="mt-3 divide-y divide-slate-200">
          {linked.map((unit) => (
            <li key={unit.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">{unit.description}</p>
                <p className="mt-1 font-mono text-sm text-slate-600">
                  lot {unit.lot} · {shortTag(unit.tagEpc)} · {linkedClock(unit.checkedInAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                  Linked
                </span>
                {unit.status === "in_stock" ? (
                  <button
                    type="button"
                    data-keep-focus
                    onClick={() => void unlink(unit.id)}
                    className="min-h-11 min-w-11 rounded-xl border-2 border-slate-300 text-lg font-bold"
                    aria-label={`Unlink ${shortTag(unit.tagEpc)}`}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {linked.length === 0 ? (
            <li className="py-3 text-slate-500">No units linked yet.</li>
          ) : null}
        </ul>
      </section>

      {working ? <p className="text-lg font-medium text-slate-600">Reading scan…</p> : null}
    </div>
  );
}

export type { TaggedUnit };
