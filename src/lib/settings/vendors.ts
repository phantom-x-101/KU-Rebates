import { getDb, type AppDb } from "@/db";
import { vendors } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createVendorSchema } from "@/lib/settings/schemas";

export async function listVendors(db: AppDb = getDb()) {
  return db.select().from(vendors).orderBy(vendors.name);
}

export async function createVendor(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = createVendorSchema.parse(input);
  const [row] = await db
    .insert(vendors)
    .values({
      name: data.name,
      externalId: data.externalId || null,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "vendors",
      entityId: row.id,
      action: "create",
      detail: data.name,
    },
    db,
  );
  return row;
}
