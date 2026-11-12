/**
 * Obviously fake demo GTINs. The 0000000999 prefix is not a real company prefix.
 * The check digit is valid so a scanner that verifies GS1 still reads the label.
 */

export function gtin14(body13: string): string {
  if (!/^\d{13}$/.test(body13)) {
    throw new Error(`GTIN body must be 13 digits: ${body13}`);
  }
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = body13.charCodeAt(i) - 48;
    const fromRight = 13 - i;
    sum += digit * (fromRight % 2 === 1 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return body13 + String(check);
}

/** Product ids 5–24. Serial is (id - 4), so these never collide with Terumo or Vendor C. */
export function demoGtin(productId: number): string {
  if (productId < 5 || productId > 24) {
    throw new Error(`demo GTIN is only defined for products 5–24 (got ${productId})`);
  }
  const serial = String(productId - 4).padStart(3, "0");
  return gtin14(`0000000999${serial}`);
}

export function gs1Element(gtin: string, expiryIso: string, lot: string): string {
  const yymmdd =
    expiryIso.slice(2, 4) + expiryIso.slice(5, 7) + expiryIso.slice(8, 10);
  return `(01)${gtin}(17)${yymmdd}(10)${lot}`;
}

/** Fake HIBC item codes. The station will ask for lot and expiry. */
export const DEMO_HIBC = {
  vendorCWire: "+HDEMOC0007",
  vendorDDx: "+HDEMOD0012",
  vendorFMap: "+HDEMOF0019",
  vendorGSpec: "+HDEMOG0024",
} as const;

/** Lots that stay on the shelf so the printed sheet can be scanned live. */
export const LIVE_LOTS = {
  sheath: { productId: 5, lot: "LIVESH501", expiry: "2031-09-01", qty: 3 },
  map: { productId: 9, lot: "LIVEMAP901", expiry: "2031-10-01", qty: 3 },
  wire: { productId: 13, lot: "LIVEGW1301", expiry: "2031-07-01", qty: 4 },
  hibcWire: { productId: 7, lot: "LIVEGW701", expiry: "2031-05-20", qty: 3 },
  implant: { productId: 22, lot: "VGIMP9001", expiry: "2031-06-15", qty: 2 },
  expired: { productId: 14, lot: "VE-EXPIRED", expiry: "2024-03-01", qty: 1 },
  mapExtra: { productId: 4, lot: "VCMAP2002", expiry: "2027-08-16", qty: 2 },
} as const;
