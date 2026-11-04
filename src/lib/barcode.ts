/**
 * Barcode parsing for consignment scans.
 * GS1: item (GTIN AI 01), lot (AI 10), expiry (AI 17 YYMMDD).
 * HIBC: item only — lot and expiry are entered manually in the prototype.
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
};

/** Spec demo: Terumo Pinnacle sheath — GS1 with lot + expiry. */
export const TERUMO_GS1_SAMPLE =
  "(01)00380628008026(17)281101(10)0001681425";

/** Compact (no parentheses) form of the Terumo sample. */
export const TERUMO_GS1_COMPACT =
  "010038062800802617281101100001681425";

/** Spec demo: Cardiva Vascade MVP — HIBC item only. */
export const CARDIVA_HIBC_SAMPLE = "+H83800612C0";

const GS1_FNC1 = String.fromCharCode(29);

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

function looksLikeHibc(raw: string): boolean {
  return /^\+[A-Za-z0-9./$-]/.test(raw) || /^\/[A-Za-z0-9]/.test(raw);
}

function parseHibc(raw: string): ParsedBarcode {
  // HIBC primary: +[LIC][product][unit][check] — treat whole token as item id.
  const item = raw.replace(/\s+/g, "");
  return {
    format: "hibc",
    raw,
    gtin: null,
    item,
    lot: null,
    expiry: null,
  };
}

/**
 * Parse GS1 Element String. Supports parenthetical AIs and compact/FNC1 forms.
 * Fixed-length AIs handled: 01 (14), 17 (6). Variable: 10 (lot) until FNC1 or end.
 */
function parseGs1(raw: string): ParsedBarcode {
  const cleaned = normalizeRaw(raw).replace(/[()]/g, "");
  let gtin: string | null = null;
  let lot: string | null = null;
  let expiry: string | null = null;

  // Parenthetical form first: (01)…(17)…(10)…
  const paren = [...normalizeRaw(raw).matchAll(/\((\d{2,4})\)([^\(]+)/g)];
  if (paren.length > 0) {
    for (const m of paren) {
      const ai = m[1];
      const value = m[2].trim();
      if (ai === "01") gtin = value.padStart(14, "0").slice(-14);
      else if (ai === "17") expiry = yyMmDdToIso(value.slice(0, 6));
      else if (ai === "10") lot = value.replace(GS1_FNC1, "").trim() || null;
    }
  } else {
    // Compact Element String walk
    let i = 0;
    const s = cleaned.replace(new RegExp(GS1_FNC1, "g"), "|");
    while (i < s.length) {
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
      if (s.startsWith("10", i)) {
        i += 2;
        let end = s.indexOf("|", i);
        if (end === -1) end = s.length;
        // If another fixed AI follows without FNC1 (common in demo strings),
        // stop lot before a known AI prefix when remaining looks like AI+data.
        const rest = s.slice(i, end);
        lot = rest || null;
        i = end + (end < s.length && s[end] === "|" ? 1 : rest.length);
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
  const n = normalizeRaw(raw);
  if (/\(01\)/.test(n) || /\(17\)/.test(n) || /\(10\)/.test(n)) return true;
  if (/^01\d{14}/.test(n.replace(/[()]/g, ""))) return true;
  return false;
}

/**
 * Parse a scanned or typed barcode. GS1 yields item/lot/expiry when present;
 * HIBC yields item only.
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

  if (looksLikeHibc(raw)) {
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
