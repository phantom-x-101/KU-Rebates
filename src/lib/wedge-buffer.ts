/** Keyboard-wedge scans: buffer fast keystrokes at the document, submit on terminator or idle. */

export const WEDGE_IDLE_MS = 250;
export const WEDGE_MIN_AUTO_LEN = 6;
export const LAST_READ_MS = 8000;

const TERMINATOR_KEYS = new Set(["Enter", "NumpadEnter", "Tab", "\n", "\r"]);
const TERMINATOR_CODES = new Set([9, 10, 13]);

export type WedgeKeyEvent = {
  key: string;
  keyCode?: number;
  which?: number;
  charCode?: number;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
};

export type WedgePushResult =
  | { action: "ignore"; buffer: string }
  | { action: "buffer"; buffer: string }
  | { action: "clear"; buffer: string }
  | { action: "submit"; buffer: string; value: string };

export type LastReadKind =
  | "item_recognised"
  | "lot_recognised"
  | "tag_linked"
  | "checked_out"
  | "returned"
  | "rejected"
  | "unknown";

export const LAST_READ_LABEL: Record<LastReadKind, string> = {
  item_recognised: "Item recognised",
  lot_recognised: "Lot recognised",
  tag_linked: "Tag linked",
  checked_out: "Checked out",
  returned: "Returned",
  rejected: "Rejected",
  unknown: "Unknown",
};

export function isWedgeChar(key: string): boolean {
  if (key.length !== 1) return false;
  const code = key.charCodeAt(0);
  return code >= 32 || code === 29;
}

export function isWedgeTerminator(event: Pick<WedgeKeyEvent, "key" | "keyCode" | "which" | "charCode">): boolean {
  if (TERMINATOR_KEYS.has(event.key)) return true;
  const code = event.keyCode ?? event.which ?? event.charCode;
  return code != null && TERMINATOR_CODES.has(code);
}

/** Android WebView often reports key as Unidentified; fall back to keyCode. */
export function charFromWedgeEvent(event: WedgeKeyEvent): string | null {
  if (isWedgeChar(event.key)) return event.key;
  const code = event.charCode || event.keyCode || event.which || 0;
  if (code === 29) return String.fromCharCode(29);
  if (code >= 32 && code <= 126) return String.fromCharCode(code);
  return null;
}

export function cleanWedgeValue(raw: string): string {
  return raw.replace(/\u0000/g, "").replace(/[\r\n\t]+/g, "").trim();
}

export function mergeWedgeSources(buffer: string, inputValue: string): string {
  if (!inputValue) return buffer;
  if (!buffer) return inputValue;
  if (buffer === inputValue) return buffer;
  if (inputValue.startsWith(buffer) || inputValue.includes(buffer)) return inputValue;
  if (buffer.startsWith(inputValue) || buffer.includes(inputValue)) return buffer;
  return buffer.length >= inputValue.length ? buffer : inputValue;
}

export function pushWedgeKey(buffer: string, event: WedgeKeyEvent): WedgePushResult {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) {
    return { action: "ignore", buffer };
  }
  if (isWedgeTerminator(event)) {
    const value = cleanWedgeValue(buffer);
    if (!value) return { action: "clear", buffer: "" };
    return { action: "submit", buffer: "", value };
  }
  if (event.key === "Escape") {
    return { action: "clear", buffer: "" };
  }
  if (event.key === "Backspace") {
    return { action: "buffer", buffer: buffer.slice(0, -1) };
  }
  const ch = charFromWedgeEvent(event);
  if (ch) {
    return { action: "buffer", buffer: buffer + ch };
  }
  return { action: "ignore", buffer };
}

export function idleSubmitValue(buffer: string): string | null {
  const value = cleanWedgeValue(buffer);
  return value.length >= WEDGE_MIN_AUTO_LEN ? value : null;
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof HTMLElement === "undefined") return false;
  if (!(el instanceof HTMLElement)) return false;
  if (el.id === "wedge-scan") return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    if (["checkbox", "radio", "button", "submit", "reset"].includes(type)) {
      return false;
    }
    return true;
  }
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[data-keep-focus]"));
}

export function logWedgeScan(raw: string) {
  console.log("[wedge] scan", raw);
}

export function itemReadBanner(description: string): string {
  return `Item read: ${description}. Now scan the lot barcode`;
}

export function lotReadBanner(lot: string): string {
  return `Lot read: ${lot}. Now scan the RFID tag`;
}

export function tagLinkedBanner(tag: string): string {
  return `Tag linked: ${tag}`;
}

export function checkedOutBanner(description: string): string {
  return `Checked out: ${description}. KU pays now`;
}

export function returnedBanner(description: string): string {
  return `Returned: ${description}`;
}
