import {
  CARDIVA_VASCADE,
  DECA_CABLE_PACK,
  NUVISION_NAV,
  TERUMO_11FR,
  TERUMO_8FR,
  gs1LotLabel,
  gtinLabel,
  hibcPrimaryLabel,
  hibcSecondaryLabel,
  type RealProduct,
} from "@/lib/real-products";

export type DemoSymbology = "gs1-128" | "hibc" | "code128";

export type DemoLabel = {
  id: string;
  title: string;
  caption: string;
  barcode: string;
  symbology: DemoSymbology;
  note: string;
};

export const UNKNOWN_BARCODE = "UNKNOWN-DEMO-99";

function gs1Pair(product: RealProduct, vendor: string): DemoLabel[] {
  return [
    {
      id: `${product.catalogNumber}-item`,
      title: `${product.description} · item`,
      caption: `${product.catalogNumber} · GTIN ${product.gtin}`,
      barcode: gtinLabel(product),
      symbology: "gs1-128",
      note: `${vendor}. Real package. GTIN only. Scan first; the station waits for the lot label.`,
    },
    {
      id: `${product.catalogNumber}-lot`,
      title: `${product.description} · lot and expiry`,
      caption: `lot ${product.lot} · exp ${product.expiry}`,
      barcode: gs1LotLabel(product),
      symbology: "gs1-128",
      note: `${vendor}. Real package. No GTIN. Scan right after the item label.`,
    },
  ];
}

export const DEMO_LABELS: DemoLabel[] = [
  ...gs1Pair(TERUMO_8FR, "Terry Terumo"),
  ...gs1Pair(TERUMO_11FR, "Terry Terumo"),
  {
    id: "cardiva-item",
    title: `${CARDIVA_VASCADE.description} · item`,
    caption: `${CARDIVA_VASCADE.catalogNumber} · HIBC ${CARDIVA_VASCADE.hibc} + check character`,
    barcode: hibcPrimaryLabel(CARDIVA_VASCADE),
    symbology: "hibc",
    note: "Pat Cardiva. Real package. Code 39 HIBC item code. Scan first; the station waits for the lot label.",
  },
  {
    id: "cardiva-lot",
    title: `${CARDIVA_VASCADE.description} · lot and expiry`,
    caption: `lot ${CARDIVA_VASCADE.lot} · exp ${CARDIVA_VASCADE.expiry}`,
    barcode: hibcSecondaryLabel(CARDIVA_VASCADE),
    symbology: "hibc",
    note: "Pat Cardiva. Real package. Code 39 HIBC +$$3 YYMMDD lot. Scan right after the item label.",
  },
  ...gs1Pair(NUVISION_NAV, "Nico NuVision"),
  {
    id: "deca-pack",
    title: `${DECA_CABLE_PACK.description} · hospital-owned`,
    caption: `${DECA_CABLE_PACK.catalogNumber} · not on any contract`,
    barcode: DECA_CABLE_PACK.catalogNumber,
    symbology: "code128",
    note: `Already on the shelf. Alex uses it; that opens "Not on any contract". Sterile date ${DECA_CABLE_PACK.sterileDate}. Lot ${DECA_CABLE_PACK.lot} and expiry ${DECA_CABLE_PACK.expiry} are demo data.`,
  },
  {
    id: "unknown",
    title: "Unknown barcode",
    caption: UNKNOWN_BARCODE,
    barcode: UNKNOWN_BARCODE,
    symbology: "code128",
    note: "Not in the catalog. A vendor check-in is rejected and nothing is added to the shelf.",
  },
];

/**
 * Text actually encoded in the printed symbol.
 * Parentheses are for people; a wedge scanner types the compact element string.
 */
export function labelSymbolText(barcode: string): string {
  const parts = [...barcode.matchAll(/\((\d{2,4})\)([^()]*)/g)];
  if (parts.length === 0) return barcode.trim();
  return parts.map((part) => `${part[1]}${part[2].trim()}`).join("");
}
