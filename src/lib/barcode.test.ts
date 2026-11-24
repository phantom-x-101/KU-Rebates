import { describe, expect, it } from "vitest";
import {
  CARDIVA_HIBC_SAMPLE,
  TERUMO_GS1_COMPACT,
  TERUMO_GS1_SAMPLE,
  describeScan,
  hibcCheckChar,
  hibcItemLookupKeys,
  isLotExpiryOnly,
  pairLotScan,
  parseBarcode,
  withHibcCheck,
} from "@/lib/barcode";
import { DEMO_LABELS, labelSymbolText } from "@/lib/demo-labels";
import { demoGtin, gtin14 } from "@/lib/demo-gtin";
import {
  CARDIVA_VASCADE,
  NUVISION_NAV,
  TERUMO_11FR,
  TERUMO_8FR,
  gs1LotLabel,
  gtinLabel,
  hibcPrimaryLabel,
  hibcSecondaryLabel,
} from "@/lib/real-products";

describe("parseBarcode", () => {
  it("parses the combined Terumo GS1 string with item, lot, and expiry", () => {
    const parsed = parseBarcode(TERUMO_GS1_SAMPLE);
    expect(parsed.format).toBe("gs1");
    expect(parsed.gtin).toBe("00389701007496");
    expect(parsed.item).toBe("00389701007496");
    expect(parsed.lot).toBe("0001681425");
    expect(parsed.expiry).toBe("2028-11-01");
  });

  it("parses the compact Element String the same way", () => {
    const parsed = parseBarcode(TERUMO_GS1_COMPACT);
    expect(parsed.gtin).toBe("00389701007496");
    expect(parsed.lot).toBe("0001681425");
    expect(parsed.expiry).toBe("2028-11-01");
  });

  it("parses each printed label the same way as the human-readable string", () => {
    const labels = [...DEMO_LABELS];
    for (const label of labels) {
      const shown = parseBarcode(label.barcode);
      const scanned = parseBarcode(labelSymbolText(label.barcode));
      expect(scanned.format).toBe(shown.format);
      expect(scanned.item).toBe(shown.item);
      expect(scanned.lot).toBe(shown.lot);
      expect(scanned.expiry).toBe(shown.expiry);
    }
  });

  it("builds obviously fake demo GTINs with a valid check digit", () => {
    for (let id = 5; id <= 24; id++) {
      const gtin = demoGtin(id);
      expect(gtin.startsWith("0000000999")).toBe(true);
      expect(gtin).toBe(gtin14(gtin.slice(0, 13)));
    }
    expect(gtin14("0003600029145")).toBe("00036000291452");
  });

  it("finds a valid check digit on every GTIN read from the real packages", () => {
    for (const product of [TERUMO_8FR, TERUMO_11FR, NUVISION_NAV]) {
      expect(gtin14(product.gtin!.slice(0, 13))).toBe(product.gtin);
    }
  });
});

describe("real labels: two separate barcodes", () => {
  it("reads a GTIN-only label as the item with no lot or expiry", () => {
    for (const product of [TERUMO_8FR, TERUMO_11FR, NUVISION_NAV]) {
      for (const text of [gtinLabel(product), labelSymbolText(gtinLabel(product))]) {
        const parsed = parseBarcode(text);
        expect(parsed.format).toBe("gs1");
        expect(parsed.gtin).toBe(product.gtin);
        expect(parsed.lot).toBeNull();
        expect(parsed.expiry).toBeNull();
        expect(isLotExpiryOnly(parsed)).toBe(false);
      }
    }
  });

  it("reads a (17)+(10) label with no GTIN as lot and expiry only", () => {
    for (const product of [TERUMO_8FR, TERUMO_11FR, NUVISION_NAV]) {
      for (const text of [gs1LotLabel(product), labelSymbolText(gs1LotLabel(product))]) {
        const parsed = parseBarcode(text);
        expect(parsed.format).toBe("gs1");
        expect(parsed.gtin).toBeNull();
        expect(parsed.item).toBeNull();
        expect(parsed.lot).toBe(product.lot);
        expect(parsed.expiry).toBe(product.expiry);
        expect(isLotExpiryOnly(parsed)).toBe(true);
      }
    }
  });

  it("reads a scanner's ]C1 prefix and FNC1 separators", () => {
    const fnc1 = String.fromCharCode(29);
    const parsed = parseBarcode(`]C11031982149L${fnc1}17270702`);
    expect(parsed.lot).toBe("31982149L");
    expect(parsed.expiry).toBe("2027-07-02");
    expect(parsed.gtin).toBeNull();
  });
});

describe("HIBC (Code 39)", () => {
  it("computes the mod-43 check character", () => {
    expect(hibcCheckChar("+M729800612C0")).toBe("O");
    expect(hibcCheckChar("+M729800612C")).toBe("O");
    expect(hibcCheckChar("lower-ok")).toBe(hibcCheckChar("LOWER-OK"));
    expect(hibcCheckChar("#")).toBeNull();
  });

  it("reads the Cardiva item code with or without its check character", () => {
    const typed = parseBarcode(CARDIVA_HIBC_SAMPLE);
    expect(typed.format).toBe("hibc");
    expect(typed.item).toBe("+M729800612C0");
    expect(typed.checked).toBe(false);
    expect(typed.lot).toBeNull();

    const scanned = parseBarcode(hibcPrimaryLabel(CARDIVA_VASCADE));
    expect(hibcPrimaryLabel(CARDIVA_VASCADE)).toBe("+M729800612C0O");
    expect(scanned.item).toBe("+M729800612C0");
    expect(scanned.checked).toBe(true);
  });

  it("reads +M729800612CO as item +M729800612C (last character was the check letter)", () => {
    const parsed = parseBarcode("+M729800612CO");
    expect(parsed.item).toBe("+M729800612C");
    expect(parsed.checked).toBe(true);
  });

  it("keeps a trailing extra 0 on the Cardiva item and says it is not the check character", () => {
    const parsed = parseBarcode("+M729800612C00");
    expect(parsed.item).toBe("+M729800612C00");
    expect(parsed.checked).toBe(false);
    expect(hibcItemLookupKeys(parsed.item!)).toContain("+M729800612C0");
    expect(describeScan(parsed)).toMatch(/trailing 0 is not a valid check character/);
    expect(describeScan(parsed)).toMatch(/mod-43 of the rest is O/);
  });

  it("names the missing check character on the typed Cardiva item code", () => {
    expect(describeScan(parseBarcode(CARDIVA_HIBC_SAMPLE))).toMatch(
      /trailing 0 is not a valid check character \(mod-43 of the rest is O\)/,
    );
    expect(describeScan(parseBarcode(hibcPrimaryLabel(CARDIVA_VASCADE)))).toMatch(
      /check character OK/,
    );
  });

  it("strips Code 39 start and stop asterisks", () => {
    expect(parseBarcode("*+M729800612C0O*").item).toBe("+M729800612C0");
  });

  it("reads the +$$3 secondary as lot and expiry with the link character", () => {
    const label = hibcSecondaryLabel(CARDIVA_VASCADE);
    expect(label).toBe("+$$3280409G612C260420BOG");
    const parsed = parseBarcode(label);
    expect(parsed.format).toBe("hibc");
    expect(parsed.item).toBeNull();
    expect(parsed.lot).toBe("G612C260420B");
    expect(parsed.expiry).toBe("2028-04-09");
    expect(parsed.link).toBe("O");
    expect(isLotExpiryOnly(parsed)).toBe(true);
  });

  it("reads a typed secondary without link or check characters", () => {
    const parsed = parseBarcode("+$$3280409G612C260420B");
    expect(parsed.lot).toBe("G612C260420B");
    expect(parsed.expiry).toBe("2028-04-09");
    expect(parsed.link).toBeNull();
  });

  it("reads a concatenated primary/secondary in one symbol", () => {
    const parsed = parseBarcode(withHibcCheck("+M729800612C0/$$3280409G612C260420B"));
    expect(parsed.item).toBe("+M729800612C0");
    expect(parsed.lot).toBe("G612C260420B");
    expect(parsed.expiry).toBe("2028-04-09");
  });

  it("keeps older placeholder HIBC codes as item-only", () => {
    const parsed = parseBarcode("+HDEMOC0007");
    expect(parsed.item).toBe("+HDEMOC0007");
    expect(parsed.checked).toBe(false);
  });
});

describe("pairLotScan", () => {
  it("attaches a GS1 lot label to the GTIN scanned before it", () => {
    const pair = pairLotScan(gtinLabel(TERUMO_11FR), parseBarcode(gs1LotLabel(TERUMO_11FR)));
    expect(pair).toEqual({ ok: true, lot: "0001476667", expiry: "2028-07-01" });
  });

  it("accepts the HIBC secondary when its link matches the primary", () => {
    const lot = parseBarcode(hibcSecondaryLabel(CARDIVA_VASCADE));
    expect(pairLotScan(CARDIVA_HIBC_SAMPLE, lot).ok).toBe(true);
    expect(pairLotScan(hibcPrimaryLabel(CARDIVA_VASCADE), lot).ok).toBe(true);
    expect(pairLotScan("+M729800612C00", lot).ok).toBe(true);
  });

  it("refuses an HIBC secondary whose link belongs to another item", () => {
    const lot = parseBarcode(hibcSecondaryLabel(CARDIVA_VASCADE));
    const pair = pairLotScan("+HDEMOC0007", lot);
    expect(pair.ok).toBe(false);
  });

  it("refuses a barcode that is not a lot label", () => {
    expect(pairLotScan(gtinLabel(TERUMO_8FR), parseBarcode(gtinLabel(TERUMO_8FR))).ok).toBe(false);
  });
});
