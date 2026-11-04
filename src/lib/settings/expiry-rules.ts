import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { expiryRules, vendors } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createExpiryRuleSchema } from "@/lib/settings/schemas";

export async function listExpiryRules(db: AppDb = getDb()) {
  return db
    .select({
      id: expiryRules.id,
      vendorId: expiryRules.vendorId,
      vendorName: vendors.name,
      daysBefore: expiryRules.daysBefore,
      vendorPaysExpired: expiryRules.vendorPaysExpired,
    })
    .from(expiryRules)
    .leftJoin(vendors, eq(expiryRules.vendorId, vendors.id))
    .orderBy(expiryRules.id);
}

export async function createExpiryRule(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = createExpiryRuleSchema.parse(input);
  const [row] = await db
    .insert(expiryRules)
    .values({
      vendorId: data.vendorId ?? null,
      daysBefore: data.daysBefore,
      vendorPaysExpired: data.vendorPaysExpired,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "expiry_rules",
      entityId: row.id,
      action: "create",
      detail: `vendor=${data.vendorId ?? "global"} days=${data.daysBefore}`,
    },
    db,
  );
  return row;
}
