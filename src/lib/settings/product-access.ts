import { and, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  departments,
  productAccess,
  products,
  storageLocations,
  vendors,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { upsertProductAccessSchema } from "@/lib/settings/schemas";

export async function listProductAccess(db: AppDb = getDb()) {
  return db
    .select({
      productId: productAccess.productId,
      departmentId: productAccess.departmentId,
      accessMode: productAccess.accessMode,
      locationId: productAccess.locationId,
      parLevel: productAccess.parLevel,
      catalogNumber: products.catalogNumber,
      productDescription: products.description,
      vendorName: vendors.name,
      departmentName: departments.name,
      locationName: storageLocations.name,
    })
    .from(productAccess)
    .innerJoin(products, eq(productAccess.productId, products.id))
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .innerJoin(departments, eq(productAccess.departmentId, departments.id))
    .leftJoin(
      storageLocations,
      eq(productAccess.locationId, storageLocations.id),
    )
    .orderBy(vendors.name, products.catalogNumber, departments.name);
}

export async function upsertProductAccess(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = upsertProductAccessSchema.parse(input);

  const existing = await db
    .select()
    .from(productAccess)
    .where(
      and(
        eq(productAccess.productId, data.productId),
        eq(productAccess.departmentId, data.departmentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(productAccess)
      .set({
        accessMode: data.accessMode,
        locationId: data.locationId ?? null,
        parLevel: data.parLevel ?? null,
      })
      .where(
        and(
          eq(productAccess.productId, data.productId),
          eq(productAccess.departmentId, data.departmentId),
        ),
      );
  } else {
    await db.insert(productAccess).values({
      productId: data.productId,
      departmentId: data.departmentId,
      accessMode: data.accessMode,
      locationId: data.locationId ?? null,
      parLevel: data.parLevel ?? null,
    });
  }

  await audit(
    {
      userId,
      container: 1,
      entity: "product_access",
      entityId: data.productId,
      action: existing.length > 0 ? "update" : "create",
      detail: `dept=${data.departmentId} mode=${data.accessMode} par=${data.parLevel ?? "null"}`,
    },
    db,
  );

  return data;
}
