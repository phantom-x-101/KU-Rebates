import { describe, expect, it } from "vitest";
import {
  CARDIVA_HIBC_SAMPLE,
  TERUMO_GS1_COMPACT,
  TERUMO_GS1_SAMPLE,
  parseBarcode,
} from "@/lib/barcode";

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

  it("parses Cardiva HIBC sample as item-only (no lot/expiry)", () => {
    const parsed = parseBarcode(CARDIVA_HIBC_SAMPLE);
    expect(parsed.format).toBe("hibc");
    expect(parsed.item).toBe("+H83800612C0");
    expect(parsed.gtin).toBeNull();
    expect(parsed.lot).toBeNull();
    expect(parsed.expiry).toBeNull();
  });
});
