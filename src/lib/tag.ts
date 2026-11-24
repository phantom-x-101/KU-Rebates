/** Keyboard-wedge RFID reads: trim, uppercase, keep alphanumeric. */

export const TAG_MIN_LEN = 8;
export const TAG_MAX_LEN = 40;

/** Example IDs used in tests. Demo data. */
export const EXAMPLE_TAG_IDS = [
  "E200-0000-0001",
  "E20000000001",
  "E28011700000020A5F3C9D41",
  "DA1000000000000103",
] as const;

function cleanedTag(raw: string) {
  return raw.replace(/\u0000/g, "").trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * Canonical tag ID: trim, uppercase, drop separators.
 * Stored value is this canonical form (8–40 alphanumeric).
 */
export function normalizeTag(raw: string): string | null {
  const id = cleanedTag(raw);
  if (id.length < TAG_MIN_LEN || id.length > TAG_MAX_LEN) return null;
  return id;
}

export type TagReject = "empty" | "too_short";

export function tagRejectReason(raw: string): TagReject | null {
  const trimmed = raw.replace(/\u0000/g, "").trim();
  if (!trimmed) return "empty";
  const id = cleanedTag(trimmed);
  if (id.length < TAG_MIN_LEN || id.length > TAG_MAX_LEN) return "too_short";
  return null;
}

export function tagRejectMessage(reason: TagReject): string {
  if (reason === "empty") return "Tag ID is empty.";
  return "Tag ID is too short.";
}

/**
 * A wedge read that can be an RFID tag (not GS1/HIBC).
 * Catalog numbers still go through the barcode path on Check out
 * unless they match a linked unit.
 */
export function looksLikeTag(raw: string): boolean {
  const trimmed = raw.replace(/\u0000/g, "").trim();
  if (!trimmed || /^[+(]/.test(trimmed)) return false;
  return normalizeTag(trimmed) != null;
}

/** Full display; grouping is visual only and is not stored. */
export function formatTag(epc: string): string {
  const id = normalizeTag(epc) ?? cleanedTag(epc);
  if (!id) return epc.trim();
  if (id.startsWith("E200") && id.length === 12) {
    return id.match(/.{1,4}/g)?.join("-") ?? id;
  }
  return id;
}

/** First and last characters, for list rows. */
export function shortTag(epc: string): string {
  const id = normalizeTag(epc) ?? cleanedTag(epc);
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
