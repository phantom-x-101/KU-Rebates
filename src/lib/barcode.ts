/**
 * Barcode parsing for consignment scans.
 * GS1: item (GTIN AI 01), lot (AI 10), expiry (AI 17 YYMMDD).
 * Real labels often print two codes: one with only (01), one with only (17)+(10).
 * HIBC (Code 39): primary "+LIC PCN UoM [check]" is the item; secondary
 * "+$$3 YYMMDD lot [link][check]" is the lot and expiry. Both may come alone.
 */

export type BarcodeFormat = "gs1" | "hibc" | "other";

export type ParsedBarcode = {
  format: BarcodeFormat;
  raw: string;
  /** GTIN (14 digits) when GS1 AI 01 is present */
  gtin: string | null;
  /** Primary item key used for product_identifiers lookup */
  item: string | null;
  lot: string | null;
  /** ISO date YYYY-MM-DD when expiry is known */
  expiry: string | null;
  /** HIBC standalone secondary: link character (the primary's check character). */
  link?: string | null;
  /** HIBC: the scan ended with a valid mod-43 check character. */
  checked?: boolean;
};

/** Combined GS1 string for the Terumo 8 Fr sheath (one-scan fallback). */
export const TERUMO_GS1_SAMPLE =
  "(01)00389701007496(17)281101(10)0001681425";

/** Compact (no parentheses) form of the Terumo sample. */
export const TERUMO_GS1_COMPACT =
  "010038970100749617281101100001681425";

/** Cardiva Vascade MVP item code as read from the label (HIBC primary). */
export const CARDIVA_HIBC_SAMPLE = "+M729800612C0";

const GS1_FNC1 = String.fromCharCode(29);
const CODE39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

function normalizeRaw(raw: string): string {
  return raw.trim().replace(/\u001d/g, GS1_FNC1);
}

function yyMmDdToIso(yyMmDd: string): string | null {
  if (!/^\d{6}$/.test(yyMmDd)) return null;
  const yy = Number(yyMmDd.slice(0, 2));
  const mm = Number(yyMmDd.slice(2, 4));
  const dd = Number(yyMmDd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return `${String(year).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** HIBC mod-43 check character over Code 39 values. Null if a character is not Code 39. */
export function hibcCheckChar(data: string): string | null {
  let sum = 0;
  for (const ch of data.toUpperCase()) {
    const value = CODE39_CHARS.indexOf(ch);
    if (value < 0) return null;
    sum += value;
  }
  return CODE39_CHARS[sum % 43]!;
}

/** Append the HIBC check character (what a printed Code 39 symbol carries). */
export function withHibcCheck(data: string): string {
  const check = hibcCheckChar(data);
  if (!check) throw new Error(`Not a Code 39 string: ${data}`);
  return data + check;
}

/**
 * HIBC item keys to try against product_identifiers.
 * The printed Code 39 may include a check character, an extra 0/O, or both.
 */
export function hibcItemLookupKeys(item: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    if (value.length < 7 || seen.has(value)) return;
    seen.add(value);
    keys.push(value);
  };
  const swapTail = (value: string) => {
    if (value.endsWith("0")) add(`${value.slice(0, -1)}O`);
    if (value.endsWith("O")) add(`${value.slice(0, -1)}0`);
  };
  add(item);
  swapTail(item);
  let current = item;
  for (let n = 0; n < 2 && current.length > 8; n += 1) {
    current = current.slice(0, -1);
    add(current);
    swapTail(current);
  }
  return keys;
}

function stripHibcCheck(token: string): { data: string; checked: boolean } {
  if (token.length < 3) return { data: token, checked: false };
  const body = token.slice(0, -1);
  if (hibcCheckChar(body) === token.slice(-1)) {
    return { data: body, checked: true };
  }
  return { data: token, checked: false };
}

function looksLikeHibc(raw: string): boolean {
  return /^\+[A-Za-z0-9./$-]/.test(raw) || /^\/[A-Za-z0-9]/.test(raw);
}

/**
 * Secondary data after "+" (standalone) or "/" (concatenated): "$$3YYMMDD lot",
 * "$$2MMDDYY lot", or "$ lot".
 */
function hibcSecondary(data: string): { lot: string | null; expiry: string | null } {
  let match = /^\$\$3(\d{6})(.*)$/.exec(data);
  if (match) return { lot: match[2] || null, expiry: yyMmDdToIso(match[1]!) };
  match = /^\$\$2(\d{2})(\d{2})(\d{2})(.*)$/.exec(data);
  if (match) {
    return {
      lot: match[4] || null,
      expiry: yyMmDdToIso(`${match[3]}${match[1]}${match[2]}`),
    };
  }
  match = /^\$(?!\$)(.*)$/.exec(data);
  if (match) return { lot: match[1] || null, expiry: null };
  return { lot: null, expiry: null };
}

function parseHibc(raw: string): ParsedBarcode {
  const token = raw.replace(/\s+/g, "").replace(/^\*|\*$/g, "").toUpperCase();
  const { data, checked } = stripHibcCheck(token);
  const base = { format: "hibc" as const, raw, gtin: null, checked };

  if (data.startsWith("+$")) {
    const secondary = hibcSecondary(data.slice(1));
    // A complete standalone secondary ends with the link character before the check.
    if (checked && secondary.lot && secondary.lot.length > 1) {
      return {
        ...base,
        item: null,
        lot: secondary.lot.slice(0, -1),
        expiry: secondary.expiry,
        link: secondary.lot.slice(-1),
      };
    }
    return { ...base, item: null, lot: secondary.lot, expiry: secondary.expiry, link: null };
  }

  const slash = data.indexOf("/", 1);
  if (data.startsWith("+") && slash > 0 && data[slash + 1] === "$") {
    const secondary = hibcSecondary(data.slice(slash + 1));
    return {
      ...base,
      item: data.slice(0, slash),
      lot: secondary.lot,
      expiry: secondary.expiry,
      link: null,
    };
  }

  return { ...base, item: data, lot: null, expiry: null, link: null };
}

/**
 * Parse GS1 Element String. Supports parenthetical AIs and compact/FNC1 forms.
 * Fixed-length AIs handled: 01 (14), 11 and 17 (6). Variable: 10 (lot), 21 (serial).
 */
function parseGs1(raw: string): ParsedBarcode {
  const normalized = normalizeRaw(raw).replace(/^\][A-Za-z]\d/, "");
  let gtin: string | null = null;
  let lot: string | null = null;
  let expiry: string | null = null;

  const paren = [...normalized.matchAll(/\((\d{2,4})\)([^\(]+)/g)];
  if (paren.length > 0) {
    for (const m of paren) {
      const ai = m[1];
      const value = m[2].trim();
      if (ai === "01") gtin = value.padStart(14, "0").slice(-14);
      else if (ai === "17") expiry = yyMmDdToIso(value.slice(0, 6));
      else if (ai === "10") lot = value.replace(GS1_FNC1, "").trim() || null;
    }
  } else {
    let i = 0;
    const s = normalized.replace(new RegExp(GS1_FNC1, "g"), "|");
    const variable = () => {
      let end = s.indexOf("|", i);
      if (end === -1) end = s.length;
      const value = s.slice(i, end);
      i = end + 1;
      return value;
    };
    while (i < s.length) {
      if (s[i] === "|") {
        i += 1;
        continue;
      }
      if (s.startsWith("01", i) && /^\d{14}/.test(s.slice(i + 2))) {
        gtin = s.slice(i + 2, i + 16);
        i += 16;
        continue;
      }
      if (s.startsWith("17", i) && /^\d{6}/.test(s.slice(i + 2))) {
        expiry = yyMmDdToIso(s.slice(i + 2, i + 8));
        i += 8;
        continue;
      }
      if (s.startsWith("11", i) && /^\d{6}/.test(s.slice(i + 2))) {
        i += 8;
        continue;
      }
      if (s.startsWith("10", i)) {
        i += 2;
        lot = variable() || null;
        continue;
      }
      if (s.startsWith("21", i)) {
        i += 2;
        variable();
        continue;
      }
      // Unknown AI — advance one char to avoid infinite loop
      i += 1;
    }
  }

  return {
    format: "gs1",
    raw,
    gtin,
    item: gtin,
    lot,
    expiry,
  };
}

function looksLikeGs1(raw: string): boolean {
  const n = normalizeRaw(raw).replace(/^\][A-Za-z]\d/, "");
  if (/\((01|10|11|17|21)\)/.test(n)) return true;
  const compact = n.replace(/[()]/g, "").replace(new RegExp(GS1_FNC1, "g"), "|");
  if (/^01\d{14}/.test(compact)) return true;
  // Lot-and-expiry label with no GTIN: 17YYMMDD then 10 lot, or 10 lot|17YYMMDD.
  if (/^(1[17]\d{6})+(10|21)\S/.test(compact)) return true;
  if (/^10[^|]+\|1[17]\d{6}/.test(compact)) return true;
  return false;
}

/** What the parser read, in words, so a person can compare it with the printed label. */
export function describeScan(parsed: ParsedBarcode): string {
  const parts: string[] = [];
  if (parsed.format === "gs1") {
    parts.push(parsed.gtin ? `GS1 GTIN ${parsed.gtin}` : "GS1 (no GTIN)");
  } else if (parsed.format === "hibc") {
    parts.push(parsed.item ? `HIBC item ${parsed.item}` : "HIBC lot label");
    if (parsed.checked) {
      parts.push("check character OK");
    } else if (parsed.item) {
      const token = parsed.raw.replace(/\s+/g, "").replace(/^\*|\*$/g, "").toUpperCase();
      const body = token.slice(0, -1);
      const expected = body ? hibcCheckChar(body) : null;
      if (expected && expected !== token.slice(-1)) {
        parts.push(
          `trailing ${token.slice(-1)} is not a valid check character (mod-43 of the rest is ${expected})`,
        );
      } else {
        parts.push("no check character");
      }
    }
  } else {
    parts.push(`Code ${parsed.raw}`);
  }
  if (parsed.lot) parts.push(`lot ${parsed.lot}`);
  if (parsed.expiry) parts.push(`exp ${parsed.expiry}`);
  return parts.join(" · ");
}

/** True when the scan carries lot and/or expiry but no product key. */
export function isLotExpiryOnly(parsed: ParsedBarcode): boolean {
  return !parsed.item && !parsed.gtin && Boolean(parsed.lot || parsed.expiry);
}

/**
 * Attach a lot-and-expiry scan to the product barcode scanned just before it.
 * For HIBC, a complete secondary carries a link character that must match the
 * primary's check character.
 */
export function pairLotScan(
  primaryRaw: string,
  lotScan: ParsedBarcode,
):
  | { ok: true; lot: string | null; expiry: string | null }
  | { ok: false; message: string } {
  if (!isLotExpiryOnly(lotScan)) {
    return { ok: false, message: "This barcode is not a lot and expiry label." };
  }
  if (lotScan.link) {
    const primary = parseBarcode(primaryRaw);
    if (primary.format === "hibc" && primary.item) {
      const checks = new Set(
        hibcItemLookupKeys(primary.item)
          .map((key) => hibcCheckChar(key))
          .filter((ch): ch is string => Boolean(ch)),
      );
      if (checks.size > 0 && !checks.has(lotScan.link)) {
        return {
          ok: false,
          message: "This lot label belongs to a different item. Scan the item barcode again.",
        };
      }
    }
  }
  return { ok: true, lot: lotScan.lot, expiry: lotScan.expiry };
}

/**
 * Parse a scanned or typed barcode. GS1 yields item/lot/expiry when present;
 * an HIBC primary yields the item, an HIBC secondary yields lot and expiry.
 */
export function parseBarcode(rawInput: string): ParsedBarcode {
  const raw = rawInput.trim();
  if (!raw) {
    return {
      format: "other",
      raw,
      gtin: null,
      item: null,
      lot: null,
      expiry: null,
    };
  }

  if (looksLikeHibc(raw.replace(/^\*(.*)\*$/, "$1"))) {
    return parseHibc(raw);
  }

  if (looksLikeGs1(raw)) {
    return parseGs1(raw);
  }

  // Fallback: treat as catalog / free-text item
  return {
    format: "other",
    raw,
    gtin: null,
    item: raw,
    lot: null,
    expiry: null,
  };
}
