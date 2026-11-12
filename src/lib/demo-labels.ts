import { CARDIVA_HIBC_SAMPLE, TERUMO_GS1_SAMPLE } from "@/lib/barcode";
import {
  DEMO_HIBC,
  LIVE_LOTS,
  demoGtin,
  gs1Element,
} from "@/lib/demo-gtin";

export type DemoSymbology = "gs1-128" | "hibc" | "code128";

export type DemoLabel = {
  id: string;
  title: string;
  caption: string;
  barcode: string;
  symbology: DemoSymbology;
  note: string;
};

/** Placeholder GTIN demo strings. Lot sits at the end so scanners may omit the GS1 separator. */
export const ABLATION_GS1_SAMPLE =
  "(01)00012345670001(17)270601(10)VCABL1001";
export const MAPPING_GS1_SAMPLE =
  "(01)00012345670002(17)270815(10)VCMAP2001";
export const MAPPING_GS1_EXTRA =
  "(01)00012345670002(17)270816(10)VCMAP2002";
export const EXPIRED_GS1_SAMPLE =
  "(01)00380628008026(17)200101(10)EXPIREDDEMO";
export const UNKNOWN_BARCODE = "UNKNOWN-DEMO-99";

export const DEMO_LABELS: DemoLabel[] = [
  {
    id: "terumo",
    title: "Terumo Pinnacle sheath 8 Fr",
    caption: "RSS802 · lot 0001681425 · exp 2028-11-01",
    barcode: TERUMO_GS1_SAMPLE,
    symbology: "gs1-128",
    note: "GS1 — lot and expiry come from the barcode",
  },
  {
    id: "cardiva",
    title: "Cardiva Vascade MVP closure",
    caption: "800-612C · lot G612C260420B · exp 2028-04-09",
    barcode: CARDIVA_HIBC_SAMPLE,
    symbology: "hibc",
    note: "HIBC — item only; confirm lot and expiry on screen",
  },
  {
    id: "ablation",
    title: "Vendor C ablation catheter (placeholder)",
    caption: "VC-ABL-01 · lot VCABL1001 · exp 2027-06-01",
    barcode: ABLATION_GS1_SAMPLE,
    symbology: "gs1-128",
    note: "Placeholder GTIN",
  },
  {
    id: "mapping",
    title: "Vendor C mapping catheter (placeholder)",
    caption: "VC-MAP-01 · lot VCMAP2001 · exp 2027-08-15",
    barcode: MAPPING_GS1_SAMPLE,
    symbology: "gs1-128",
    note: "Placeholder GTIN",
  },
  {
    id: "mapping-extra",
    title: "Vendor C mapping catheter — second unit",
    caption: "VC-MAP-01 · lot VCMAP2002 · exp 2027-08-16",
    barcode: MAPPING_GS1_EXTRA,
    symbology: "gs1-128",
    note: "On the shelf. Placeholder GTIN. Arrive, pull, or return it live.",
  },
  {
    id: "live-sheath",
    title: "Vendor C demo introducer sheath (placeholder)",
    caption: "VC-SH-07 · lot LIVESH501 · exp 2031-09-01",
    barcode: gs1Element(
      demoGtin(LIVE_LOTS.sheath.productId),
      LIVE_LOTS.sheath.expiry,
      LIVE_LOTS.sheath.lot,
    ),
    symbology: "gs1-128",
    note: "On the shelf. Fake demo GTIN. Arrive, pull, or return it live.",
  },
  {
    id: "live-map",
    title: "Vendor D demo mapping catheter (placeholder)",
    caption: "VD-MAP-01 · lot LIVEMAP901 · exp 2031-10-01",
    barcode: gs1Element(
      demoGtin(LIVE_LOTS.map.productId),
      LIVE_LOTS.map.expiry,
      LIVE_LOTS.map.lot,
    ),
    symbology: "gs1-128",
    note: "On the shelf. Fake demo GTIN. Not a real vendor product.",
  },
  {
    id: "live-wire",
    title: "Vendor E demo guidewire (placeholder)",
    caption: "VE-GW-01 · lot LIVEGW1301 · exp 2031-07-01",
    barcode: gs1Element(
      demoGtin(LIVE_LOTS.wire.productId),
      LIVE_LOTS.wire.expiry,
      LIVE_LOTS.wire.lot,
    ),
    symbology: "gs1-128",
    note: "On the shelf. Fake demo GTIN.",
  },
  {
    id: "no-contract",
    title: "Vendor G demo pulse implant — no contract",
    caption: "VG-IMP-02 · lot VGIMP9001 · exp 2031-06-15",
    barcode: gs1Element(
      demoGtin(LIVE_LOTS.implant.productId),
      LIVE_LOTS.implant.expiry,
      LIVE_LOTS.implant.lot,
    ),
    symbology: "gs1-128",
    note: "On the shelf. Placeholder product. No contract is loaded for this item.",
  },
  {
    id: "hibc-wire",
    title: "Vendor C demo guidewire (placeholder)",
    caption: "VC-GW-01 · lot LIVEGW701 · exp 2031-05-20",
    barcode: DEMO_HIBC.vendorCWire,
    symbology: "hibc",
    note: "On the shelf. HIBC — item only. Enter lot and expiry on the station.",
  },
  {
    id: "expired",
    title: "Expired Terumo sheath",
    caption: "RSS802 · lot EXPIREDDEMO · exp 2020-01-01",
    barcode: EXPIRED_GS1_SAMPLE,
    symbology: "gs1-128",
    note: "Scan should fail — expired",
  },
  {
    id: "unknown",
    title: "Unknown barcode",
    caption: UNKNOWN_BARCODE,
    barcode: UNKNOWN_BARCODE,
    symbology: "code128",
    note: "Not in the catalog — add the product from the station",
  },
];

/**
 * Text actually encoded in the printed symbol.
 * Parentheses are for people; a wedge scanner types the compact element string,
 * which is shorter and uses wider bars.
 */
export function labelSymbolText(barcode: string): string {
  const parts = [...barcode.matchAll(/\((\d{2,4})\)([^()]*)/g)];
  if (parts.length === 0) return barcode.trim();
  return parts.map((part) => `${part[1]}${part[2].trim()}`).join("");
}

/** GS1 for the seeded expiring Terumo lot. Expiry date comes from the database. */
export function expiringLotBarcode(expiryIso: string) {
  const yymmdd =
    expiryIso.slice(2, 4) + expiryIso.slice(5, 7) + expiryIso.slice(8, 10);
  return `(01)00380628008026(17)${yymmdd}(10)EXPIRINGSOON1`;
}
