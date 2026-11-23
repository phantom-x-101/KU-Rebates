import bwipjs from "bwip-js/node";
import type { DemoSymbology } from "@/lib/demo-labels";

/**
 * Large barcode of the exact string the station parses.
 * Bars are tall, with a wide quiet zone, so a handheld scanner can read them
 * on screen or on a printed page. GS1 labels are Code 128 of the compact element
 * string. HIBC labels are Code 39, like the real packages; the text already
 * ends with its HIBC check character, so no extra Code 39 check is added.
 */
export async function barcodeDataUrl(text: string, symbology: DemoSymbology = "code128") {
  const png = await bwipjs.toBuffer({
    bcid: symbology === "hibc" ? "code39" : "code128",
    text,
    scale: symbology === "hibc" ? 3 : 4,
    height: 28,
    includetext: false,
    paddingwidth: 24,
    paddingheight: 16,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
