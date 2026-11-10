import bwipjs from "bwip-js";

/**
 * Code 128 of the exact string the station parses.
 * Placeholder GTINs in the seed do not have a valid GS1 check digit, so a
 * strict GS1-128 encoder rejects them. A keyboard-wedge scanner still types
 * this element string.
 */
export async function barcodeDataUrl(text: string) {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 3,
    height: 14,
    includetext: false,
    paddingwidth: 10,
    paddingheight: 6,
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
