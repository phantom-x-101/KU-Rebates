import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import { exceptions, products, users, vendors } from "@/db/schema";
import { audit } from "@/lib/audit";

export const EXCEPTION_QUEUE_ROLES = ["supply_chain", "admin"] as const;

export function canAccessExceptionQueue(
  user: { role: string; active?: number | boolean | null } | null | undefined,
): boolean {
  if (!user || user.active === 0 || user.active === false) return false;
  return EXCEPTION_QUEUE_ROLES.includes(
    user.role as (typeof EXCEPTION_QUEUE_ROLES)[number],
  );
}

export function assertCanAccessExceptionQueue(
  user: { role: string; active?: number | boolean | null } | null | undefined,
) {
  if (!canAccessExceptionQueue(user)) {
    throw new Error("Exception queue requires supply_chain or admin");
  }
  return user!;
}

export const exceptionTypeSchema = z.enum([
  "not_on_any_contract",
  "bill_only_unmapped",
  "missing_from_item_master",
  "opened_or_wasted",
  "taken_not_scanned_or_returned",
  "expired_on_shelf",
  "closeout_exceeds_taken",
]);

export async function listExceptions(
  filters: {
    type?: string;
    sourceContainer?: number;
    status?: string;
  } = {},
  db: AppDb = getDb(),
) {
  const conditions = [];
  if (filters.type) conditions.push(eq(exceptions.type, filters.type));
  if (filters.sourceContainer !== undefined) {
    conditions.push(eq(exceptions.sourceContainer, filters.sourceContainer));
  }
  if (filters.status) conditions.push(eq(exceptions.status, filters.status));

  return db
    .select({
      id: exceptions.id,
      sourceContainer: exceptions.sourceContainer,
      type: exceptions.type,
      scanId: exceptions.scanId,
      productId: exceptions.productId,
      status: exceptions.status,
      ownerUserId: exceptions.ownerUserId,
      ownerName: users.name,
      createdAt: exceptions.createdAt,
      resolvedAt: exceptions.resolvedAt,
      resolutionNote: exceptions.resolutionNote,
      catalogNumber: products.catalogNumber,
      productDescription: products.description,
      vendorName: vendors.name,
    })
    .from(exceptions)
    .leftJoin(products, eq(exceptions.productId, products.id))
    .leftJoin(vendors, eq(products.vendorId, vendors.id))
    .leftJoin(users, eq(exceptions.ownerUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(exceptions.id));
}

export const assignOwnerSchema = z.object({
  exceptionId: z.coerce.number().int().positive(),
  ownerUserId: z.coerce.number().int().positive(),
});

export async function assignExceptionOwner(
  input: unknown,
  actorUserId: number,
  db: AppDb = getDb(),
) {
  const data = assignOwnerSchema.parse(input);
  const [row] = await db
    .update(exceptions)
    .set({
      ownerUserId: data.ownerUserId,
      status: "in_review",
    })
    .where(eq(exceptions.id, data.exceptionId))
    .returning();

  if (!row) throw new Error("Exception not found");

  await audit(
    {
      userId: actorUserId,
      container: row.sourceContainer as 1 | 2 | 3,
      entity: "exceptions",
      entityId: row.id,
      action: "assign_owner",
      detail: `owner=${data.ownerUserId}`,
    },
    db,
  );
  return row;
}

export const resolveExceptionSchema = z.object({
  exceptionId: z.coerce.number().int().positive(),
  resolutionNote: z.string().trim().min(1, "Resolution note is required"),
});

export async function resolveException(
  input: unknown,
  actorUserId: number,
  db: AppDb = getDb(),
) {
  const data = resolveExceptionSchema.parse(input);
  const [row] = await db
    .update(exceptions)
    .set({
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolutionNote: data.resolutionNote,
    })
    .where(eq(exceptions.id, data.exceptionId))
    .returning();

  if (!row) throw new Error("Exception not found");

  await audit(
    {
      userId: actorUserId,
      container: row.sourceContainer as 1 | 2 | 3,
      entity: "exceptions",
      entityId: row.id,
      action: "resolve",
      detail: data.resolutionNote,
    },
    db,
  );
  return row;
}

export async function listAssignableOwners(db: AppDb = getDb()) {
  return db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.active, 1))
    .orderBy(users.name);
}
