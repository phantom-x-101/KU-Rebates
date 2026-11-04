import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { departments, storageLocations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createStorageLocationSchema } from "@/lib/settings/schemas";

export async function listDepartments(db: AppDb = getDb()) {
  return db.select().from(departments).orderBy(departments.name);
}

export async function listStorageLocations(db: AppDb = getDb()) {
  return db
    .select({
      id: storageLocations.id,
      name: storageLocations.name,
      storageType: storageLocations.storageType,
      departmentId: storageLocations.departmentId,
      departmentName: departments.name,
    })
    .from(storageLocations)
    .leftJoin(departments, eq(storageLocations.departmentId, departments.id))
    .orderBy(storageLocations.name);
}

export async function createStorageLocation(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = createStorageLocationSchema.parse(input);
  const [row] = await db
    .insert(storageLocations)
    .values({
      name: data.name,
      departmentId: data.departmentId ?? null,
      storageType: data.storageType ?? null,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "storage_locations",
      entityId: row.id,
      action: "create",
      detail: data.name,
    },
    db,
  );
  return row;
}
