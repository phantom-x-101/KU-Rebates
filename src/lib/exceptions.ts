import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import {
  auditLog,
  contractLineProducts,
  exceptions,
  products,
  users,
  vendors,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { CASE_TIMEOUT_ACTION, caseIdFromDetail } from "@/lib/reconcile";

export const EXCEPTION_QUEUE_ROLES = [
  "supply_chain",
  "admin",
  "category_owner",
] as const;

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
    throw new Error(
      "Exception queue requires supply_chain, category_owner, or admin",
    );
  }
  return user!;
}

export const exceptionTypeSchema = z.enum([
  "case_open_past_timeout",
  "expired_on_shelf",
  "bill_only_unmapped",
  "not_on_any_contract",
  "missing_from_item_master",
]);

export const UNMAPPED_ACTION = "create_unmapped";

export type UnmappedSource = "station" | "arrival" | "pull";

function barcodeFromDetail(detail: string | null): string | null {
  if (!detail) return null;
  const at = detail.indexOf("barcode=");
  return at < 0 ? null : detail.slice(at + "barcode=".length);
}

async function unresolvedUnmapped(raw: string, db: AppDb) {
  const rows = await db
    .select({ id: exceptions.id, detail: auditLog.detail })
    .from(exceptions)
    .innerJoin(
      auditLog,
      and(
        eq(auditLog.entity, "exceptions"),
        eq(auditLog.entityId, exceptions.id),
        eq(auditLog.action, UNMAPPED_ACTION),
      ),
    )
    .where(
      and(
        eq(exceptions.type, "bill_only_unmapped"),
        ne(exceptions.status, "resolved"),
      ),
    );
  return rows.filter((row) => barcodeFromDetail(row.detail) === raw);
}

/** One open `bill_only_unmapped` exception per unknown barcode. */
export async function recordUnmappedBarcode(
  rawBarcode: string,
  source: UnmappedSource,
  userId: number | null,
  db: AppDb = getDb(),
) {
  const raw = rawBarcode.trim();
  if (!raw) return null;
  const [existing] = await unresolvedUnmapped(raw, db);
  if (existing) return { id: existing.id, created: false };

  const [row] = await db
    .insert(exceptions)
    .values({
      sourceContainer: 1,
      type: "bill_only_unmapped",
      productId: null,
      status: "open",
      ownerUserId: null,
    })
    .returning();
  await audit(
    {
      userId,
      container: 1,
      entity: "exceptions",
      entityId: row.id,
      action: UNMAPPED_ACTION,
      detail: `via=${source} barcode=${raw}`,
    },
    db,
  );
  return { id: row.id, created: true };
}

export const NOT_ON_CONTRACT_ACTION = "create_not_on_any_contract";

export async function productOnAnyContract(productId: number, db: AppDb = getDb()) {
  const [row] = await db
    .select({ productId: contractLineProducts.productId })
    .from(contractLineProducts)
    .where(eq(contractLineProducts.productId, productId))
    .limit(1);
  return Boolean(row);
}

/** One open `not_on_any_contract` exception per product scanned with no contract line. */
export async function flagNotOnAnyContract(
  productId: number,
  via: "arrival" | "pull",
  userId: number | null,
  db: AppDb = getDb(),
) {
  if (await productOnAnyContract(productId, db)) return null;
  const [existing] = await db
    .select({ id: exceptions.id })
    .from(exceptions)
    .where(
      and(
        eq(exceptions.type, "not_on_any_contract"),
        eq(exceptions.productId, productId),
        ne(exceptions.status, "resolved"),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [row] = await db
    .insert(exceptions)
    .values({
      sourceContainer: 1,
      type: "not_on_any_contract",
      productId,
      status: "open",
      ownerUserId: null,
    })
    .returning();
  await audit(
    {
      userId,
      container: 1,
      entity: "exceptions",
      entityId: row.id,
      action: NOT_ON_CONTRACT_ACTION,
      detail: `via=${via} product=${productId}`,
    },
    db,
  );
  return { id: row.id, created: true };
}

/** Resolve open unmapped-barcode exceptions once the barcode maps to a product. */
export async function resolveUnmappedBarcode(
  rawBarcode: string,
  productId: number,
  userId: number,
  db: AppDb = getDb(),
) {
  const open = await unresolvedUnmapped(rawBarcode.trim(), db);
  for (const row of open) {
    await resolveException(
      {
        exceptionId: row.id,
        resolutionNote: `Barcode mapped to product ${productId}`,
      },
      userId,
      db,
    );
  }
  return open.map((row) => row.id);
}

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

  const rows = await db
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

  const ids = rows
    .filter((r) => r.type === "case_open_past_timeout" || r.type === "bill_only_unmapped")
    .map((r) => r.id);
  const details = ids.length
    ? await db
        .select({ entityId: auditLog.entityId, detail: auditLog.detail })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entity, "exceptions"),
            inArray(auditLog.entityId, ids),
            inArray(auditLog.action, [CASE_TIMEOUT_ACTION, UNMAPPED_ACTION]),
          ),
        )
    : [];
  const detailById = new Map(details.map((d) => [d.entityId, d.detail]));

  return rows.map((r) => {
    const detail = detailById.get(r.id) ?? null;
    return {
      ...r,
      caseId: r.type === "case_open_past_timeout" ? caseIdFromDetail(detail) : null,
      barcode: r.type === "bill_only_unmapped" ? barcodeFromDetail(detail) : null,
    };
  });
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
