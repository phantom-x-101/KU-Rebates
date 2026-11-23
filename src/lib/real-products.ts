/**
 * Products copied from physical packages. GTINs and the HIBC item code were read
 * from photos: confirm each one with a real scan before trusting it.
 * Prices and par levels are placeholders.
 */
import { withHibcCheck } from "@/lib/barcode";

export const NUVISION_VENDOR_ID = 8;
export const IN_HOUSE_VENDOR_ID = 9;

export type RealProduct = {
  id: number;
  vendorId: number;
  catalogNumber: string;
  description: string;
  category: string;
  unitPrice: number;
  parLevel: number | null;
  hospitalOwned: boolean;
  gtin: string | null;
  /** HIBC item data as printed, without the check character. */
  hibc: string | null;
  lot: string;
  expiry: string;
  /** Units on the seeded shelf. */
  qty: number;
  /** Hospital-sterilized packs: date on the SPD label, not an expiry. */
  sterileDate?: string | null;
};

export const TERUMO_8FR: RealProduct = {
  id: 1,
  vendorId: 1,
  catalogNumber: "RSS802",
  description: "Terumo Pinnacle Introducer Sheath 8 Fr",
  category: "sheath",
  unitPrice: 185,
  parLevel: 4,
  hospitalOwned: false,
  gtin: "00389701007496",
  hibc: null,
  lot: "0001681425",
  expiry: "2028-11-01",
  qty: 3,
};

export const CARDIVA_VASCADE: RealProduct = {
  id: 2,
  vendorId: 2,
  catalogNumber: "800-612C",
  description: "Cardiva Vascade MVP closure",
  category: "closure",
  unitPrice: 395,
  parLevel: 3,
  hospitalOwned: false,
  gtin: null,
  hibc: "+M729800612C0",
  lot: "G612C260420B",
  expiry: "2028-04-09",
  qty: 2,
};

export const TERUMO_11FR: RealProduct = {
  id: 25,
  vendorId: 1,
  catalogNumber: "RSS106",
  description: "Terumo Pinnacle Introducer Sheath 11 Fr",
  category: "sheath",
  unitPrice: 195,
  parLevel: 2,
  hospitalOwned: false,
  gtin: "00389701007762",
  hibc: null,
  lot: "0001476667",
  expiry: "2028-07-01",
  qty: 2,
};

export const NUVISION_NAV: RealProduct = {
  id: 26,
  vendorId: NUVISION_VENDOR_ID,
  catalogNumber: "FG12081",
  description: "NuVision NAV Ultrasound Catheter",
  category: "ultrasound catheter",
  unitPrice: 2400,
  parLevel: 1,
  hospitalOwned: false,
  gtin: "10846835026559",
  hibc: null,
  lot: "31982149L",
  expiry: "2027-07-02",
  qty: 1,
};

/** Sterilized in-house instrument pack. Not vendor stock and on no contract. */
export const DECA_CABLE_PACK: RealProduct = {
  id: 27,
  vendorId: IN_HOUSE_VENDOR_ID,
  catalogNumber: "CB3410CT",
  description: "Pack EP Lab SMALL DECA Cable",
  category: "instrument pack",
  unitPrice: 0,
  parLevel: null,
  hospitalOwned: true,
  gtin: null,
  hibc: null,
  lot: "SPD-PLACEHOLDER-1",
  expiry: "2027-03-16",
  sterileDate: "2026-09-16",
  qty: 1,
};

export const REAL_PRODUCTS: RealProduct[] = [
  TERUMO_8FR,
  CARDIVA_VASCADE,
  TERUMO_11FR,
  NUVISION_NAV,
  DECA_CABLE_PACK,
];

function yymmdd(expiryIso: string) {
  return expiryIso.slice(2, 4) + expiryIso.slice(5, 7) + expiryIso.slice(8, 10);
}

/** GS1 label with only the GTIN. */
export function gtinLabel(product: RealProduct) {
  return `(01)${product.gtin}`;
}

/** GS1 label with only expiry and lot, no GTIN. */
export function gs1LotLabel(product: RealProduct) {
  return `(17)${yymmdd(product.expiry)}(10)${product.lot}`;
}

/** HIBC primary as a Code 39 symbol carries it, with the check character. */
export function hibcPrimaryLabel(product: RealProduct) {
  return withHibcCheck(product.hibc!);
}

/** HIBC standalone secondary: +$$3 YYMMDD lot, link character, check character. */
export function hibcSecondaryLabel(product: RealProduct) {
  const primary = hibcPrimaryLabel(product);
  const link = primary.slice(-1);
  return withHibcCheck(`+$$3${yymmdd(product.expiry)}${product.lot}${link}`);
}
