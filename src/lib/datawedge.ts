/**
 * Experimental DataWedge intent links. The app never depends on these
 * succeeding — Check in / Check out still use the keyboard-wedge input.
 *
 * https://techdocs.zebra.com/datawedge/latest/guide/api/softscantrigger/
 * https://techdocs.zebra.com/datawedge/latest/guide/api/softrfidtrigger/
 */

export const DATAWEDGE_ACTION = "com.symbol.datawedge.api.ACTION";
export const SOFT_SCAN_TRIGGER = "com.symbol.datawedge.api.SOFT_SCAN_TRIGGER";
export const SOFT_RFID_TRIGGER = "com.symbol.datawedge.api.SOFT_RFID_TRIGGER";
export const START_SCANNING = "START_SCANNING";

export type SoftTriggerKind = "barcode" | "rfid";

export function datawedgeSoftTriggerHref(kind: SoftTriggerKind): string {
  const extra = kind === "rfid" ? SOFT_RFID_TRIGGER : SOFT_SCAN_TRIGGER;
  return `intent:#Intent;action=${DATAWEDGE_ACTION};S.${extra}=${START_SCANNING};end`;
}

export type SoftTriggerResult = {
  ok: boolean;
  kind: SoftTriggerKind;
  href: string;
  error?: string;
};

export function fireSoftTrigger(
  kind: SoftTriggerKind,
  openHref: (href: string) => void,
): SoftTriggerResult {
  const href = datawedgeSoftTriggerHref(kind);
  try {
    openHref(href);
    return { ok: true, kind, href };
  } catch (error) {
    return {
      ok: false,
      kind,
      href,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
