import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { productIdentifiers, products, vendors } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createProductSchema } from "@/lib/settings/schemas";

export async function listProducts(db: AppDb = getDb()) {
  const rows = await db
    .select({
      id: products.id,
      vendorId: products.vendorId,
      vendorName: vendors.name,
      catalogNumber: products.catalogNumber,
      description: products.description,
      category: products.category,
      unitPrice: products.unitPrice,
      inItemMaster: products.inItemMaster,
    })
    .from(products)
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .orderBy(vendors.name, products.catalogNumber);

  const ids = await db.select().from(productIdentifiers);
  return rows.map((p) => ({
    ...p,
    identifiers: ids.filter((i) => i.productId === p.id),
  }));
}

export async function createProduct(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = createProductSchema.parse(input);

  const [product] = await db
    .insert(products)
    .values({
      vendorId: data.vendorId,
      catalogNumber: data.catalogNumber,
      description: data.description,
      category: data.category || null,
      inItemMaster: 0,
    })
    .returning();

  const idRows: { idType: "gtin" | "hibc" | "catalog"; value: string }[] = [];
  const catalogValue = data.catalogIdentifier?.trim() || data.catalogNumber;
  idRows.push({ idType: "catalog", value: catalogValue });
  if (data.gtin?.trim()) idRows.push({ idType: "gtin", value: data.gtin.trim() });
  if (data.hibc?.trim()) idRows.push({ idType: "hibc", value: data.hibc.trim() });

  for (const row of idRows) {
    await db.insert(productIdentifiers).values({
      productId: product.id,
      idType: row.idType,
      value: row.value,
    });
  }

  await audit(
    {
      userId,
      container: 1,
      entity: "products",
      entityId: product.id,
      action: "create",
      detail: `${data.catalogNumber} (${idRows.map((r) => r.idType).join(",")})`,
    },
    db,
  );

  return product;
}
