import { CARDIVA_HIBC_SAMPLE, TERUMO_GS1_SAMPLE } from "@/lib/barcode";

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
    note: "Not on the seeded case until you arrive and pull it",
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

/** GS1 for the seeded expiring Terumo lot. Expiry date comes from the database. */
export function expiringLotBarcode(expiryIso: string) {
  const yymmdd =
    expiryIso.slice(2, 4) + expiryIso.slice(5, 7) + expiryIso.slice(8, 10);
  return `(01)00380628008026(17)${yymmdd}(10)EXPIRINGSOON1`;
}
