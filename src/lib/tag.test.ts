import { describe, expect, it } from "vitest";
import {
  EXAMPLE_TAG_IDS,
  formatTag,
  looksLikeTag,
  normalizeTag,
  shortTag,
  tagRejectReason,
} from "@/lib/tag";

describe("tag normalize", () => {
  it("accepts the four example IDs (trim, uppercase, 8–40 alphanumeric)", () => {
    expect(normalizeTag(" E200-0000-0001 ")).toBe("E20000000001");
    expect(normalizeTag("E20000000001")).toBe("E20000000001");
    expect(normalizeTag("E28011700000020A5F3C9D41")).toBe(
      "E28011700000020A5F3C9D41",
    );
    expect(normalizeTag("da1000000000000103")).toBe("DA1000000000000103");
    expect(EXAMPLE_TAG_IDS).toHaveLength(4);
    for (const id of EXAMPLE_TAG_IDS) {
      expect(normalizeTag(id)).toBeTruthy();
      expect(looksLikeTag(id)).toBe(true);
    }
  });

  it("rejects empty and too-short IDs and leaves GS1/HIBC on the barcode path", () => {
    expect(tagRejectReason("   ")).toBe("empty");
    expect(tagRejectReason("ABC")).toBe("too_short");
    expect(normalizeTag("ABC")).toBeNull();
    expect(looksLikeTag("(01)00389701007496")).toBe(false);
    expect(looksLikeTag("+M729800612C0O")).toBe(false);
    expect(looksLikeTag("RSS802")).toBe(false);
  });

  it("shortens list display to first and last characters", () => {
    expect(formatTag("E20000000001")).toBe("E200-0000-0001");
    expect(shortTag("E28011700000020A5F3C9D41")).toBe("E280…9D41");
    expect(shortTag("DA1000000000000103")).toBe("DA10…0103");
  });
});
