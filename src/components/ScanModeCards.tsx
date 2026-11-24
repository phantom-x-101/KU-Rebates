"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fireSoftTrigger, type SoftTriggerKind } from "@/lib/datawedge";
import { isWedgeTerminator } from "@/lib/wedge-buffer";
import { shouldRestoreWedgeFocus, wedgeInputMode } from "@/lib/wedge-input";

export type ScanSource = "barcode" | "rfid";

/**
 * Focus the wedge input without opening the IME: inputMode none plus a
 * brief readOnly so Android does not raise the keyboard. DataWedge can still
 * type once readOnly is cleared. Type manually uses a normal focus.
 */
export function holdWedgeFocus(
  input: HTMLInputElement | null,
  typeManually: boolean,
) {
  if (!input) return;
  if (typeManually) {
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
    return;
  }
  if (document.activeElement === input && input.inputMode === "none" && !input.readOnly) {
    return;
  }
  input.inputMode = "none";
  input.readOnly = true;
  input.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    input.readOnly = false;
  });
}

function logSoftTrigger(kind: SoftTriggerKind) {
  const result = fireSoftTrigger(kind, (href) => {
    window.location.assign(href);
  });
  console.log("[datawedge] soft trigger", result);
}

export function ScanModeCards({
  first,
  selected,
  completed = {},
  onSelect,
  scanRef,
  onSubmit,
  disabled,
  rfidReady = true,
  softTrigger = false,
  hideSecond = false,
  onTypeManuallyChange,
}: {
  first: ScanSource;
  selected: ScanSource;
  completed?: Partial<Record<ScanSource, boolean>>;
  onSelect: (source: ScanSource) => void;
  scanRef: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  disabled?: boolean;
  rfidReady?: boolean;
  softTrigger?: boolean;
  hideSecond?: boolean;
  onTypeManuallyChange?: (on: boolean) => void;
}) {
  const order: ScanSource[] = (
    first === "barcode" ? ["barcode", "rfid"] : ["rfid", "barcode"]
  ).slice(0, hideSecond ? 1 : 2);
  const inputLabel = selected === "rfid" ? "Scan RFID" : "Scan barcode";
  const [typeManually, setTypeManually] = useState(false);
  const typeManuallyRef = useRef(false);
  typeManuallyRef.current = typeManually;
  const inputMode = wedgeInputMode(typeManually);

  useEffect(() => {
    holdWedgeFocus(scanRef.current, typeManuallyRef.current);

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (
        !shouldRestoreWedgeFocus({
          activeIsKeepFocus: Boolean(target?.closest("[data-keep-focus]")),
        })
      ) {
        return;
      }
      holdWedgeFocus(scanRef.current, typeManuallyRef.current);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [scanRef]);

  useEffect(() => {
    if (!disabled) holdWedgeFocus(scanRef.current, typeManuallyRef.current);
  }, [disabled, scanRef]);

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${order.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {order.map((id, index) => {
          const active = selected === id;
          const ticked = Boolean(completed[id]);
          const label = id === "barcode" ? "Scan barcode" : "Scan RFID";
          const step = index === 0 ? "First" : "Second";
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`relative min-h-28 rounded-2xl border-4 px-4 py-4 text-left ${
                active
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              {ticked ? (
                <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">
                  ✓
                </span>
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {step}
              </p>
              <p className="mt-1 text-xl font-bold text-[#16323c]">{label}</p>
              {id === "rfid" && !rfidReady ? (
                <p className="mt-1 text-sm text-slate-500">After the barcode</p>
              ) : null}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={scanRef}
          id="wedge-scan"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode={inputMode}
          enterKeyHint="done"
          aria-label={inputLabel}
          className={
            typeManually
              ? "mb-3 w-full rounded-xl border-2 border-slate-400 px-3 py-3 text-xl"
              : "sr-only"
          }
          onKeyDown={(event) => {
            const terminator = isWedgeTerminator(event);
            if (!terminator) return;
            if (typeManually && event.key !== "Enter") return;
            event.preventDefault();
            if (event.key === "Tab") event.stopPropagation();
            onSubmit();
          }}
        />
        <div
          role="status"
          className={`rounded-2xl px-6 py-5 text-center ${
            disabled
              ? "bg-slate-300 text-slate-500"
              : "bg-pc-blue text-white"
          }`}
        >
          <p className="text-3xl font-bold tracking-wide">SCAN</p>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="inline-flex items-center gap-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={typeManually}
            onChange={(event) => {
              const on = event.target.checked;
              typeManuallyRef.current = on;
              setTypeManually(on);
              onTypeManuallyChange?.(on);
              queueMicrotask(() => holdWedgeFocus(scanRef.current, on));
            }}
          />
          Type manually
        </label>
        {softTrigger ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => logSoftTrigger(selected)}
            className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 font-semibold text-slate-800 disabled:opacity-40"
          >
            Try soft trigger
          </button>
        ) : null}
      </div>
    </div>
  );
}
