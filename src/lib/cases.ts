import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import {
  cases,
  departments,
  procedureTypes,
  products,
  rooms,
  scans,
  stockEvents,
  vendors,
} from "@/db/schema";
import { audit } from "@/lib/audit";

export const CASE_ROLES = ["tech", "supply_chain", "admin"] as const;

const optionalPositiveInt = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}, z.number().int().positive().optional());

export const openCaseSchema = z.object({
  departmentId: z.coerce.number().int().positive(),
  roomId: optionalPositiveInt,
  procedureTypeId: optionalPositiveInt,
});

export async function listDepartmentsForCases(db: AppDb = getDb()) {
  return db.select().from(departments).orderBy(departments.name);
}

export async function listRoomsForDepartment(
  departmentId: number,
  db: AppDb = getDb(),
) {
  return db
    .select()
    .from(rooms)
    .where(eq(rooms.departmentId, departmentId))
    .orderBy(rooms.name);
}

export async function listProcedureTypesForDepartment(
  departmentId: number,
  db: AppDb = getDb(),
) {
  return db
    .select()
    .from(procedureTypes)
    .where(eq(procedureTypes.departmentId, departmentId))
    .orderBy(procedureTypes.name);
}

export async function listCases(db: AppDb = getDb()) {
  return db
    .select({
      id: cases.id,
      status: cases.status,
      openedAt: cases.openedAt,
      closedAt: cases.closedAt,
      departmentName: departments.name,
      roomName: rooms.name,
      procedureTypeName: procedureTypes.name,
    })
    .from(cases)
    .innerJoin(departments, eq(cases.departmentId, departments.id))
    .leftJoin(rooms, eq(cases.roomId, rooms.id))
    .leftJoin(procedureTypes, eq(cases.procedureTypeId, procedureTypes.id))
    .orderBy(desc(cases.id));
}

export async function getCase(caseId: number, db: AppDb = getDb()) {
  const [row] = await db
    .select({
      id: cases.id,
      status: cases.status,
      openedAt: cases.openedAt,
      closedAt: cases.closedAt,
      openedBy: cases.openedBy,
      departmentId: cases.departmentId,
      roomId: cases.roomId,
      procedureTypeId: cases.procedureTypeId,
      departmentName: departments.name,
      roomName: rooms.name,
      procedureTypeName: procedureTypes.name,
    })
    .from(cases)
    .innerJoin(departments, eq(cases.departmentId, departments.id))
    .leftJoin(rooms, eq(cases.roomId, rooms.id))
    .leftJoin(procedureTypes, eq(cases.procedureTypeId, procedureTypes.id))
    .where(eq(cases.id, caseId))
    .limit(1);
  return row ?? null;
}

export async function openCase(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = openCaseSchema.parse(input);
  const [row] = await db
    .insert(cases)
    .values({
      departmentId: data.departmentId,
      roomId: data.roomId ?? null,
      procedureTypeId: data.procedureTypeId ?? null,
      openedBy: userId,
      status: "open",
    })
    .returning();

  await audit(
    {
      userId,
      container: 2,
      entity: "cases",
      entityId: row.id,
      action: "open",
      detail: `dept=${data.departmentId} room=${data.roomId ?? "null"} proc=${data.procedureTypeId ?? "null"}`,
    },
    db,
  );
  return row;
}

export async function abortCase(
  caseId: number,
  userId: number,
  db: AppDb = getDb(),
) {
  const existing = await getCase(caseId, db);
  if (!existing) throw new Error("Case not found");
  if (existing.status !== "open") throw new Error("Only open cases can be aborted");

  const [row] = await db
    .update(cases)
    .set({
      status: "aborted",
      closedAt: new Date().toISOString(),
    })
    .where(eq(cases.id, caseId))
    .returning();

  await audit(
    {
      userId,
      container: 2,
      entity: "cases",
      entityId: caseId,
      action: "abort",
    },
    db,
  );
  return row;
}

export async function closeCase(
  caseId: number,
  userId: number,
  db: AppDb = getDb(),
) {
  const existing = await getCase(caseId, db);
  if (!existing) throw new Error("Case not found");
  if (existing.status !== "open") throw new Error("Only open cases can be closed");

  const [row] = await db
    .update(cases)
    .set({
      status: "closed",
      closedAt: new Date().toISOString(),
    })
    .where(eq(cases.id, caseId))
    .returning();

  await audit(
    {
      userId,
      container: 2,
      entity: "cases",
      entityId: caseId,
      action: "close",
    },
    db,
  );

  // Phase 5: gap → taken_not_scanned_or_returned; surplus → closeout_exceeds_taken
  const { createGapExceptions } = await import("@/lib/reconcile");
  await createGapExceptions(caseId, userId, db);

  return row;
}

export type CaseLineKey = {
  productId: number;
  lot: string | null;
  expiry: string | null;
  locationId: number | null;
};

function lineKey(k: CaseLineKey) {
  return `${k.productId}|${k.lot ?? ""}|${k.expiry ?? ""}|${k.locationId ?? ""}`;
}

/** Pulled lines for a case with remaining qty still needing close-out. */
export async function listCasePullLines(caseId: number, db: AppDb = getDb()) {
  const events = await db
    .select({
      id: stockEvents.id,
      eventType: stockEvents.eventType,
      productId: stockEvents.productId,
      locationId: stockEvents.locationId,
      lot: stockEvents.lot,
      expiry: stockEvents.expiry,
      qty: stockEvents.qty,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorName: vendors.name,
    })
    .from(stockEvents)
    .innerJoin(products, eq(stockEvents.productId, products.id))
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .where(eq(stockEvents.caseId, caseId));

  const caseScans = await db.select().from(scans).where(eq(scans.caseId, caseId));

  type Acc = {
    productId: number;
    lot: string | null;
    expiry: string | null;
    locationId: number | null;
    catalogNumber: string;
    description: string;
    vendorName: string;
    pulled: number;
    returned: number;
    used: number;
    wasted: number;
  };

  const map = new Map<string, Acc>();

  for (const e of events) {
    if (e.eventType !== "pulled" && e.eventType !== "returned") continue;
    const key = lineKey({
      productId: e.productId,
      lot: e.lot,
      expiry: e.expiry,
      locationId: e.locationId,
    });
    const cur =
      map.get(key) ??
      ({
        productId: e.productId,
        lot: e.lot,
        expiry: e.expiry,
        locationId: e.locationId,
        catalogNumber: e.catalogNumber,
        description: e.description,
        vendorName: e.vendorName,
        pulled: 0,
        returned: 0,
        used: 0,
        wasted: 0,
      } satisfies Acc);
    if (e.eventType === "pulled") cur.pulled += e.qty;
    if (e.eventType === "returned") cur.returned += e.qty;
    map.set(key, cur);
  }

  for (const s of caseScans) {
    if (!s.productId) continue;
    // Scans don't store location; match product/lot/expiry across locations by preferring any open line.
    const candidates = [...map.values()].filter(
      (l) =>
        l.productId === s.productId &&
        (l.lot ?? null) === (s.lot ?? null) &&
        (l.expiry ?? null) === (s.expiry ?? null),
    );
    const target =
      candidates.find((c) => c.pulled - c.returned - c.used - c.wasted > 0) ??
      candidates[0];
    if (!target) continue;
    if (s.status === "used") target.used += s.qty;
    if (s.status === "wasted") target.wasted += s.qty;
  }

  return [...map.values()].map((l) => ({
    ...l,
    remaining: l.pulled - l.returned - l.used - l.wasted,
  }));
}
