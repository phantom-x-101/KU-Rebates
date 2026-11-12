import bwipjs from "bwip-js";

/**
 * Large Code 128 of the exact string the station parses.
 * Bars are tall, with a wide quiet zone, so a handheld scanner can read them
 * on screen or on a printed page. Placeholder GTINs fail a strict GS1 check
 * digit, so this is Code 128 of the compact element string rather than GS1-128.
 */
export async function barcodeDataUrl(text: string) {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 4,
    height: 28,
    includetext: false,
    paddingwidth: 24,
    paddingheight: 16,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
