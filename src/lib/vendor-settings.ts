import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import { expiryRules, productAccess, products } from "@/db/schema";
import { audit } from "@/lib/audit";

async function assertOwnProduct(
  vendorId: number,
  productId: number,
  db: AppDb,
) {
  const [row] = await db
    .select({
      id: products.id,
      vendorId: products.vendorId,
      kuOwned: products.kuOwned,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!row) throw new Error("Product not found");
  if (row.kuOwned === 1 || row.vendorId !== vendorId) {
    throw new Error("Vendors can only change settings for their own products");
  }
  return row;
}

export const updateVendorParSchema = z.object({
  productId: z.coerce.number().int().positive(),
  parLevel: z.coerce.number().int().nonnegative(),
});

export async function updateVendorParLevel(
  input: unknown,
  vendorId: number,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = updateVendorParSchema.parse(input);
  await assertOwnProduct(vendorId, data.productId, db);
  const rows = await db
    .select()
    .from(productAccess)
    .where(eq(productAccess.productId, data.productId));
  if (rows.length === 0) {
    throw new Error("No shelf setting exists for this product");
  }
  await db
    .update(productAccess)
    .set({ parLevel: data.parLevel })
    .where(eq(productAccess.productId, data.productId));
  await audit(
    {
      userId,
      container: 1,
      entity: "product_access",
      entityId: data.productId,
      action: "update_par",
      detail: `vendor=${vendorId} par=${data.parLevel}`,
    },
    db,
  );
  return data;
}

export const updateVendorExpiryDaysSchema = z.object({
  daysBefore: z.coerce.number().int().positive(),
});

export async function updateVendorExpiryDays(
  input: unknown,
  vendorId: number,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = updateVendorExpiryDaysSchema.parse(input);
  const existing = await db
    .select()
    .from(expiryRules)
    .where(eq(expiryRules.vendorId, vendorId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(expiryRules)
      .set({ daysBefore: data.daysBefore })
      .where(and(eq(expiryRules.vendorId, vendorId)));
  } else {
    await db.insert(expiryRules).values({
      vendorId,
      daysBefore: data.daysBefore,
      vendorPaysExpired: 1,
    });
  }
  await audit(
    {
      userId,
      container: 1,
      entity: "expiry_rules",
      entityId: vendorId,
      action: "update_days_before",
      detail: `vendor=${vendorId} days=${data.daysBefore}`,
    },
    db,
  );
  return data;
}

export async function getVendorExpiryDays(
  vendorId: number,
  db: AppDb = getDb(),
) {
  const [row] = await db
    .select()
    .from(expiryRules)
    .where(eq(expiryRules.vendorId, vendorId))
    .limit(1);
  return row?.daysBefore ?? 30;
}
