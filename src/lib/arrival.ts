import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import {
  productIdentifiers,
  products,
  stockEvents,
  storageLocations,
  vendors,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { parseBarcode, type ParsedBarcode } from "@/lib/barcode";

export type IdentifiedProduct = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorName: string;
  matchedBy: string;
  matchedValue: string;
};

export function identifyLookupValues(parsed: ParsedBarcode): {
  idType: "gtin" | "hibc" | "catalog";
  value: string;
}[] {
  const out: { idType: "gtin" | "hibc" | "catalog"; value: string }[] = [];
  if (parsed.format === "gs1" && parsed.gtin) {
    out.push({ idType: "gtin", value: parsed.gtin });
  }
  if (parsed.format === "hibc" && parsed.item) {
    out.push({ idType: "hibc", value: parsed.item });
  }
  if (parsed.item) {
    out.push({ idType: "catalog", value: parsed.item });
  }
  // Also try raw string as catalog (typed catalog numbers)
  if (parsed.raw && parsed.raw !== parsed.item) {
    out.push({ idType: "catalog", value: parsed.raw });
  }
  return out;
}

export async function identifyProduct(
  rawBarcode: string,
  db: AppDb = getDb(),
): Promise<{
  parsed: ParsedBarcode;
  product: IdentifiedProduct | null;
}> {
  const parsed = parseBarcode(rawBarcode);
  const lookups = identifyLookupValues(parsed);
  if (lookups.length === 0) {
    return { parsed, product: null };
  }

  const conditions = lookups.map((l) =>
    and(
      eq(productIdentifiers.idType, l.idType),
      eq(productIdentifiers.value, l.value),
    ),
  );

  const rows = await db
    .select({
      productId: products.id,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorName: vendors.name,
      idType: productIdentifiers.idType,
      value: productIdentifiers.value,
    })
    .from(productIdentifiers)
    .innerJoin(products, eq(productIdentifiers.productId, products.id))
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .where(or(...conditions))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return { parsed, product: null };
  }

  return {
    parsed,
    product: {
      productId: row.productId,
      catalogNumber: row.catalogNumber,
      description: row.description,
      vendorName: row.vendorName,
      matchedBy: row.idType,
      matchedValue: row.value,
    },
  };
}

export const recordArrivalSchema = z.object({
  rawBarcode: z.string().trim().min(1),
  productId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  lot: z.string().trim().min(1, "Lot is required"),
  expiry: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry must be YYYY-MM-DD"),
  qty: z.coerce.number().int().positive().default(1),
  barcodeFormat: z.enum(["gs1", "hibc", "other"]).optional(),
  lotExpirySource: z.enum(["barcode", "manual"]).default("manual"),
});

export async function listArrivalLocations(db: AppDb = getDb()) {
  return db.select().from(storageLocations).orderBy(storageLocations.name);
}

export async function recordArrival(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = recordArrivalSchema.parse(input);

  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "arrived",
      productId: data.productId,
      locationId: data.locationId,
      lot: data.lot,
      expiry: data.expiry,
      qty: data.qty,
      byUserId: userId,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "stock_events",
      entityId: event.id,
      action: "arrived",
      detail: `product=${data.productId} lot=${data.lot} expiry=${data.expiry} loc=${data.locationId} qty=${data.qty} barcode=${data.rawBarcode}`,
    },
    db,
  );

  return event;
}
