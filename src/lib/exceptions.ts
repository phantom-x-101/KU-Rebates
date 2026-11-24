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
import { formatTag } from "@/lib/tag";

export const EXCEPTION_QUEUE_ROLES = [
  "supply_chain",
  "admin",
  "category_owner",
  "vendor_rep",
] as const;

export const VENDOR_EXCEPTION_TYPES = [
  "expired_on_shelf",
  "expiring_soon",
  "low_stock",
  "bill_only_unmapped",
  "rejected_arrival",
  "expired_unit",
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
      "Exception queue requires supply_chain, category_owner, admin, or vendor_rep",
    );
  }
  return user!;
}

export const exceptionTypeSchema = z.enum([
  "case_open_past_timeout",
  "expired_on_shelf",
  "expiring_soon",
  "low_stock",
  "bill_only_unmapped",
  "rejected_arrival",
  "not_on_any_contract",
  "missing_from_item_master",
  "unknown_tag",
  "expired_unit",
]);

export const UNMAPPED_ACTION = "create_unmapped";
export const REJECTED_ARRIVAL_ACTION = "create_rejected_arrival";
export const UNKNOWN_TAG_ACTION = "create_unknown_tag";
export const EXPIRED_UNIT_ACTION = "create_expired_unit";

export type UnmappedSource = "station" | "arrival" | "pull" | "use";

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
  vendorId?: number | null,
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
  const vendorBit =
    vendorId != null ? ` vendor=${vendorId}` : "";
  await audit(
    {
      userId,
      container: 1,
      entity: "exceptions",
      entityId: row.id,
      action: UNMAPPED_ACTION,
      detail: `via=${source}${vendorBit} barcode=${raw}`,
    },
    db,
  );
  return { id: row.id, created: true };
}

function tagFromDetail(detail: string | null): string | null {
  if (!detail) return null;
  const at = detail.indexOf("tag=");
  if (at < 0) return null;
  const rest = detail.slice(at + "tag=".length);
  return rest.split(/\s+/)[0] ?? null;
}

export async function recordUnknownTag(
  tagEpc: string,
  userId: number | null,
  db: AppDb = getDb(),
) {
  const tag = tagEpc.trim().toUpperCase();
  if (!tag) return null;
  const open = await db
    .select({ id: exceptions.id, detail: auditLog.detail })
    .from(exceptions)
    .innerJoin(
      auditLog,
      and(
        eq(auditLog.entity, "exceptions"),
        eq(auditLog.entityId, exceptions.id),
        eq(auditLog.action, UNKNOWN_TAG_ACTION),
      ),
    )
    .where(and(eq(exceptions.type, "unknown_tag"), ne(exceptions.status, "resolved")));
  const existing = open.find((row) => tagFromDetail(row.detail) === tag);
  if (existing) return { id: existing.id, created: false };

  const [row] = await db
    .insert(exceptions)
    .values({
      sourceContainer: 1,
      type: "unknown_tag",
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
      action: UNKNOWN_TAG_ACTION,
      detail: `tag=${tag}`,
    },
    db,
  );
  return { id: row.id, created: true };
}

export async function recordExpiredUnit(
  input: { productId: number; tagEpc: string; expiry: string },
  userId: number | null,
  db: AppDb = getDb(),
) {
  const [existing] = await db
    .select({ id: exceptions.id })
    .from(exceptions)
    .where(
      and(
        eq(exceptions.type, "expired_unit"),
        eq(exceptions.productId, input.productId),
        ne(exceptions.status, "resolved"),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [row] = await db
    .insert(exceptions)
    .values({
      sourceContainer: 1,
      type: "expired_unit",
      productId: input.productId,
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
      action: EXPIRED_UNIT_ACTION,
      detail: `tag=${input.tagEpc} expiry=${input.expiry}`,
    },
    db,
  );
  return { id: row.id, created: true };
}

function vendorIdFromDetail(detail: string | null): number | null {
  if (!detail) return null;
  const match = detail.match(/\bvendor=(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Wrong-vendor or hospital-owned arrive: exception only, no stock event. */
export async function recordRejectedArrival(
  input: {
    rawBarcode: string;
    actorVendorId: number;
    productId: number | null;
    reason: "wrong_vendor" | "hospital_owned";
    productVendorName?: string | null;
  },
  userId: number | null,
  db: AppDb = getDb(),
) {
  const raw = input.rawBarcode.trim();
  const [row] = await db
    .insert(exceptions)
    .values({
      sourceContainer: 1,
      type: "rejected_arrival",
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
      action: REJECTED_ARRIVAL_ACTION,
      detail: `via=arrival vendor=${input.actorVendorId} reason=${input.reason} barcode=${raw}`,
    },
    db,
  );
  return row;
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
  via: "arrival" | "pull" | "use",
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
    vendorId?: number;
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
      productVendorId: products.vendorId,
    })
    .from(exceptions)
    .leftJoin(products, eq(exceptions.productId, products.id))
    .leftJoin(vendors, eq(products.vendorId, vendors.id))
    .leftJoin(users, eq(exceptions.ownerUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(exceptions.id));

  const ids = rows
    .filter(
      (r) =>
        r.type === "case_open_past_timeout" ||
        r.type === "bill_only_unmapped" ||
        r.type === "rejected_arrival" ||
        r.type === "unknown_tag" ||
        r.type === "expired_unit",
    )
    .map((r) => r.id);
  const details = ids.length
    ? await db
        .select({ entityId: auditLog.entityId, detail: auditLog.detail })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entity, "exceptions"),
            inArray(auditLog.entityId, ids),
            inArray(auditLog.action, [
              CASE_TIMEOUT_ACTION,
              UNMAPPED_ACTION,
              REJECTED_ARRIVAL_ACTION,
              UNKNOWN_TAG_ACTION,
              EXPIRED_UNIT_ACTION,
            ]),
          ),
        )
    : [];
  const detailById = new Map(details.map((d) => [d.entityId, d.detail]));

  const mapped = rows.map((r) => {
    const detail = detailById.get(r.id) ?? null;
    const { productVendorId, ...rest } = r;
    return {
      ...rest,
      productVendorId,
      actorVendorId: vendorIdFromDetail(detail),
      caseId: r.type === "case_open_past_timeout" ? caseIdFromDetail(detail) : null,
      barcode:
        r.type === "bill_only_unmapped" || r.type === "rejected_arrival"
          ? barcodeFromDetail(detail)
          : r.type === "unknown_tag" || r.type === "expired_unit"
            ? formatTag(tagFromDetail(detail) ?? "")
            : null,
    };
  });

  if (filters.vendorId == null) return mapped;

  const vendorId = filters.vendorId;
  return mapped.filter((row) => {
    if (
      !VENDOR_EXCEPTION_TYPES.includes(
        row.type as (typeof VENDOR_EXCEPTION_TYPES)[number],
      )
    ) {
      return false;
    }
    if (row.type === "bill_only_unmapped" || row.type === "rejected_arrival") {
      return row.actorVendorId === vendorId;
    }
    return row.productVendorId === vendorId;
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
