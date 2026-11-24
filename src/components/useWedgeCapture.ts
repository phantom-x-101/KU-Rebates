"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  WEDGE_IDLE_MS,
  idleSubmitValue,
  isTypingTarget,
  mergeWedgeSources,
  pushWedgeKey,
} from "@/lib/wedge-buffer";

/**
 * Capture keyboard-wedge scans on document even when the hidden input
 * is not focused. Zebra/Android often skip real key values and type into
 * the field instead, so the hidden input is merged in before submit.
 * Disabled while Type manually is on, so slow typing is not auto-submitted.
 */
export function useWedgeCapture(input: {
  active: boolean;
  paused?: boolean;
  scanRef?: RefObject<HTMLInputElement | null>;
  onScan: (value: string) => void;
}) {
  const [buffer, setBuffer] = useState("");
  const bufferRef = useRef("");
  const onScanRef = useRef(input.onScan);
  onScanRef.current = input.onScan;
  const pausedRef = useRef(input.paused);
  pausedRef.current = input.paused;
  const scanRef = input.scanRef;
  const handledKeyRef = useRef(false);

  useEffect(() => {
    if (!input.active) {
      bufferRef.current = "";
      setBuffer("");
      return;
    }

    let idle: ReturnType<typeof setTimeout> | null = null;

    function fieldValue() {
      return scanRef?.current?.value ?? "";
    }

    function combined() {
      return mergeWedgeSources(bufferRef.current, fieldValue());
    }

    function clearIdle() {
      if (idle != null) {
        clearTimeout(idle);
        idle = null;
      }
    }

    function writeBuffer(next: string) {
      bufferRef.current = next;
      setBuffer(next);
    }

    function flush(value: string) {
      clearIdle();
      writeBuffer("");
      if (scanRef?.current) scanRef.current.value = "";
      onScanRef.current(value);
    }

    function armIdle() {
      clearIdle();
      idle = setTimeout(() => {
        if (pausedRef.current) {
          armIdle();
          return;
        }
        const value = idleSubmitValue(combined());
        if (!value) return;
        flush(value);
      }, WEDGE_IDLE_MS);
    }

    function applyPush(
      event: KeyboardEvent,
      extras?: { key?: string; charCode?: number },
    ) {
      if (pausedRef.current) return false;
      if (isTypingTarget(event.target)) return false;

      const result = pushWedgeKey(combined(), {
        key: extras?.key ?? event.key,
        keyCode: event.keyCode,
        which: event.which,
        charCode: extras?.charCode ?? event.charCode,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing,
      });
      if (result.action === "ignore") return false;

      event.preventDefault();
      event.stopPropagation();
      writeBuffer(result.buffer);

      if (result.action === "submit") {
        flush(result.value);
        return true;
      }
      if (result.action === "clear") {
        const leftover = idleSubmitValue(combined());
        if (leftover) {
          flush(leftover);
          return true;
        }
        clearIdle();
        if (scanRef?.current) scanRef.current.value = "";
        return true;
      }
      armIdle();
      return true;
    }

    function onKeyDown(event: KeyboardEvent) {
      handledKeyRef.current = applyPush(event);
    }

    function onKeyPress(event: KeyboardEvent) {
      if (handledKeyRef.current) return;
      const key =
        event.key?.length === 1
          ? event.key
          : event.charCode
            ? String.fromCharCode(event.charCode)
            : event.key;
      applyPush(event, { key, charCode: event.charCode });
    }

    function onKeyUp() {
      handledKeyRef.current = false;
    }

    function ingestField() {
      if (pausedRef.current) return;
      const next = mergeWedgeSources(bufferRef.current, fieldValue());
      if (!next || next === bufferRef.current) return;
      writeBuffer(next);
      armIdle();
    }

    function onBeforeInput(event: Event) {
      if (pausedRef.current) return;
      if (isTypingTarget(event.target)) return;
      const ie = event as InputEvent;
      const data = ie.data;
      if (!data) {
        ingestField();
        return;
      }
      if (handledKeyRef.current && data.length === 1 && bufferRef.current.endsWith(data)) {
        return;
      }
      const next =
        data.length > 1
          ? mergeWedgeSources(bufferRef.current, data)
          : bufferRef.current + data;
      writeBuffer(next);
      armIdle();
    }

    function onInput(event: Event) {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) || el.id !== "wedge-scan") return;
      ingestField();
    }

    function onTextInput(event: Event) {
      if (pausedRef.current) return;
      if (isTypingTarget(event.target)) return;
      const data = (event as Event & { data?: string }).data;
      if (!data) return;
      writeBuffer(mergeWedgeSources(bufferRef.current, data));
      armIdle();
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keypress", onKeyPress, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("textInput", onTextInput, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keypress", onKeyPress, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("textInput", onTextInput, true);
      clearIdle();
    };
  }, [input.active, scanRef]);

  return buffer;
}
