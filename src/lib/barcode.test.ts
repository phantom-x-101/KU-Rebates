import { describe, expect, it } from "vitest";
import {
  CARDIVA_HIBC_SAMPLE,
  TERUMO_GS1_COMPACT,
  TERUMO_GS1_SAMPLE,
  parseBarcode,
} from "@/lib/barcode";
import { DEMO_LABELS, expiringLotBarcode, labelSymbolText } from "@/lib/demo-labels";
import { demoGtin, gtin14 } from "@/lib/demo-gtin";

describe("parseBarcode", () => {
  it("parses Terumo GS1 sample with item, lot, and expiry", () => {
    const parsed = parseBarcode(TERUMO_GS1_SAMPLE);
    expect(parsed.format).toBe("gs1");
    expect(parsed.gtin).toBe("00380628008026");
    expect(parsed.item).toBe("00380628008026");
    expect(parsed.lot).toBe("0001681425");
    expect(parsed.expiry).toBe("2028-11-01");
  });

  it("parses Terumo GS1 compact Element String the same way", () => {
    const parsed = parseBarcode(TERUMO_GS1_COMPACT);
    expect(parsed.format).toBe("gs1");
    expect(parsed.gtin).toBe("00380628008026");
    expect(parsed.lot).toBe("0001681425");
    expect(parsed.expiry).toBe("2028-11-01");
  });

  it("parses each printed label the same way as the human-readable string", () => {
    const labels = [
      ...DEMO_LABELS,
      {
        barcode: expiringLotBarcode("2026-11-30"),
      },
    ];
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

  it("parses Cardiva HIBC sample as item-only (no lot/expiry)", () => {
    const parsed = parseBarcode(CARDIVA_HIBC_SAMPLE);
    expect(parsed.format).toBe("hibc");
    expect(parsed.item).toBe("+H83800612C0");
    expect(parsed.gtin).toBeNull();
    expect(parsed.lot).toBeNull();
    expect(parsed.expiry).toBeNull();
  });
});
