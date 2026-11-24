import { describe, expect, it } from "vitest";
import {
  LAST_READ_LABEL,
  LAST_READ_MS,
  WEDGE_IDLE_MS,
  charFromWedgeEvent,
  checkedOutBanner,
  cleanWedgeValue,
  idleSubmitValue,
  isTypingTarget,
  isWedgeChar,
  isWedgeTerminator,
  itemReadBanner,
  lotReadBanner,
  mergeWedgeSources,
  pushWedgeKey,
  tagLinkedBanner,
} from "@/lib/wedge-buffer";

describe("wedge buffer", () => {
  it("buffers printable characters and submits on Enter", () => {
    let buffer = "";
    for (const key of "(01)0038") {
      const next = pushWedgeKey(buffer, { key });
      expect(next.action).toBe("buffer");
      buffer = next.buffer;
    }
    const done = pushWedgeKey(buffer, { key: "Enter" });
    expect(done).toEqual({ action: "submit", buffer: "", value: "(01)0038" });
  });

  it("submits immediately on Tab, line feed and carriage return", () => {
    expect(pushWedgeKey("E28011", { key: "Tab" })).toEqual({
      action: "submit",
      buffer: "",
      value: "E28011",
    });
    expect(pushWedgeKey("E28011", { key: "\n" }).action).toBe("submit");
    expect(pushWedgeKey("E28011", { key: "\r" }).action).toBe("submit");
    expect(pushWedgeKey("E28011", { key: "Unidentified", keyCode: 13 })).toEqual({
      action: "submit",
      buffer: "",
      value: "E28011",
    });
    expect(pushWedgeKey("E28011", { key: "Unidentified", keyCode: 9 }).action).toBe(
      "submit",
    );
    expect(pushWedgeKey("E28011", { key: "Unidentified", keyCode: 10 }).action).toBe(
      "submit",
    );
    expect(isWedgeTerminator({ key: "Tab" })).toBe(true);
    expect(isWedgeTerminator({ key: "Unidentified", keyCode: 13 })).toBe(true);
  });

  it("auto-submits after idle only when at least 6 characters are buffered", () => {
    expect(WEDGE_IDLE_MS).toBe(250);
    expect(idleSubmitValue("RSS80")).toBeNull();
    expect(idleSubmitValue("RSS802")).toBe("RSS802");
    expect(idleSubmitValue("  E28011700000020A5F3C9D41  ")).toBe(
      "E28011700000020A5F3C9D41",
    );
    expect(idleSubmitValue("ABC123\r\n")).toBe("ABC123");
  });

  it("decodes Unidentified Android keys from keyCode", () => {
    expect(charFromWedgeEvent({ key: "Unidentified", keyCode: 50 })).toBe("2");
    expect(pushWedgeKey("E2801", { key: "Unidentified", keyCode: 49 })).toEqual({
      action: "buffer",
      buffer: "E28011",
    });
  });

  it("merges the hidden input value when keydown missed characters", () => {
    expect(mergeWedgeSources("", "(01)0038")).toBe("(01)0038");
    expect(mergeWedgeSources("(01)", "(01)0038")).toBe("(01)0038");
    expect(mergeWedgeSources("(01)0038", "")).toBe("(01)0038");
  });

  it("ignores modifier and composing keys", () => {
    expect(pushWedgeKey("ab", { key: "c", ctrlKey: true }).action).toBe("ignore");
    expect(pushWedgeKey("ab", { key: "c", isComposing: true }).action).toBe("ignore");
    expect(pushWedgeKey("ab", { key: "Shift" }).action).toBe("ignore");
  });

  it("clears on Escape and empty Enter", () => {
    expect(pushWedgeKey("abc", { key: "Escape" })).toEqual({
      action: "clear",
      buffer: "",
    });
    expect(pushWedgeKey("   ", { key: "Enter" })).toEqual({
      action: "clear",
      buffer: "",
    });
    expect(pushWedgeKey("", { key: "Tab" }).action).toBe("clear");
  });

  it("treats GS1 FNC1 (ASCII 29) as a wedge character", () => {
    const gs = String.fromCharCode(29);
    expect(isWedgeChar(gs)).toBe(true);
    expect(isWedgeChar("A")).toBe(true);
    expect(isWedgeChar("Enter")).toBe(false);
  });

  it("does not treat the hidden wedge input as a typing target", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("last-read copy", () => {
  it("names the outcome and tells the operator the next step", () => {
    expect(LAST_READ_MS).toBe(8000);
    expect(LAST_READ_LABEL.item_recognised).toBe("Item recognised");
    expect(LAST_READ_LABEL.lot_recognised).toBe("Lot recognised");
    expect(LAST_READ_LABEL.tag_linked).toBe("Tag linked");
    expect(LAST_READ_LABEL.unknown).toBe("Unknown");
    expect(itemReadBanner("Terumo Pinnacle Introducer Sheath 8 Fr")).toBe(
      "Item read: Terumo Pinnacle Introducer Sheath 8 Fr. Now scan the lot barcode",
    );
    expect(lotReadBanner("0001681425")).toBe(
      "Lot read: 0001681425. Now scan the RFID tag",
    );
    expect(tagLinkedBanner("DA1000000000000103")).toBe(
      "Tag linked: DA1000000000000103",
    );
    expect(checkedOutBanner("Terumo Pinnacle Introducer Sheath 8 Fr")).toContain(
      "KU pays now",
    );
    expect(cleanWedgeValue("\u0000abc\u0000")).toBe("abc");
    expect(cleanWedgeValue("lot\t\r\n")).toBe("lot");
  });
});
