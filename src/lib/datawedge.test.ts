import { describe, expect, it, vi } from "vitest";
import {
  DATAWEDGE_ACTION,
  SOFT_RFID_TRIGGER,
  SOFT_SCAN_TRIGGER,
  START_SCANNING,
  datawedgeSoftTriggerHref,
  fireSoftTrigger,
} from "@/lib/datawedge";
import { shouldRestoreWedgeFocus, wedgeInputMode } from "@/lib/wedge-input";
import { parseScanDebugEnabled, parseSoftTriggerEnabled } from "@/lib/settings/scanner";

describe("DataWedge soft trigger intents", () => {
  it("builds barcode and RFID START_SCANNING intent links", () => {
    expect(datawedgeSoftTriggerHref("barcode")).toBe(
      `intent:#Intent;action=${DATAWEDGE_ACTION};S.${SOFT_SCAN_TRIGGER}=${START_SCANNING};end`,
    );
    expect(datawedgeSoftTriggerHref("rfid")).toBe(
      `intent:#Intent;action=${DATAWEDGE_ACTION};S.${SOFT_RFID_TRIGGER}=${START_SCANNING};end`,
    );
  });

  it("logs a failed open without throwing", () => {
    const result = fireSoftTrigger("barcode", () => {
      throw new Error("no intent handler");
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no intent handler");
    expect(result.href).toContain(SOFT_SCAN_TRIGGER);
  });

  it("dispatches through the provided opener", () => {
    const openHref = vi.fn();
    const result = fireSoftTrigger("rfid", openHref);
    expect(result.ok).toBe(true);
    expect(openHref).toHaveBeenCalledOnce();
    expect(openHref.mock.calls[0][0]).toContain(SOFT_RFID_TRIGGER);
  });
});

describe("wedge input mode", () => {
  it("uses none unless Type manually is on", () => {
    expect(wedgeInputMode(false)).toBe("none");
    expect(wedgeInputMode(true)).toBe("text");
  });

  it("does not steal focus from keep-focus fields", () => {
    expect(shouldRestoreWedgeFocus({ activeIsKeepFocus: true })).toBe(false);
    expect(shouldRestoreWedgeFocus({ activeIsKeepFocus: false })).toBe(true);
  });

  it("treats the setting as off unless the value is on", () => {
    expect(parseSoftTriggerEnabled(undefined)).toBe(false);
    expect(parseSoftTriggerEnabled("off")).toBe(false);
    expect(parseSoftTriggerEnabled("on")).toBe(true);
    expect(parseScanDebugEnabled(undefined)).toBe(false);
    expect(parseScanDebugEnabled("on")).toBe(true);
  });
});
