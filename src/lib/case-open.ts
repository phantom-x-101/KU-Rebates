import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import { cases, departments, procedureTypes, rooms } from "@/db/schema";
import { getCase, openCase } from "@/lib/cases";

export type CaseOpenLab = { id: number; name: string; preview: boolean };
export type CaseOpenRoom = { id: number; departmentId: number; name: string };
export type CaseOpenProcedure = { id: number; departmentId: number; name: string };

export type CaseOpenOptions = {
  labs: CaseOpenLab[];
  rooms: CaseOpenRoom[];
  procedures: CaseOpenProcedure[];
  last: {
    departmentId: number;
    roomId: number | null;
    procedureTypeId: number | null;
  } | null;
  commonProcedure: Record<number, number>;
};

/** Only the pilot lab has its real workflow built; every other lab is a preview. */
export function isPreviewLab(phase: string) {
  return phase !== "pilot";
}

export async function loadCaseOpenOptions(
  userId: number,
  db: AppDb = getDb(),
): Promise<CaseOpenOptions> {
  const [deptRows, roomRows, procRows, lastRows, usage] = await Promise.all([
    db.select().from(departments).orderBy(departments.name),
    db.select().from(rooms).orderBy(rooms.name),
    db.select().from(procedureTypes).orderBy(procedureTypes.name),
    db
      .select({
        departmentId: cases.departmentId,
        roomId: cases.roomId,
        procedureTypeId: cases.procedureTypeId,
      })
      .from(cases)
      .where(eq(cases.openedBy, userId))
      .orderBy(desc(cases.id))
      .limit(1),
    db
      .select({
        departmentId: cases.departmentId,
        procedureTypeId: cases.procedureTypeId,
        n: count(),
      })
      .from(cases)
      .where(isNotNull(cases.procedureTypeId))
      .groupBy(cases.departmentId, cases.procedureTypeId),
  ]);

  const withRooms = new Set(roomRows.map((room) => room.departmentId));
  const labs = deptRows
    .filter((dept) => withRooms.has(dept.id))
    .map((dept) => ({ id: dept.id, name: dept.name, preview: isPreviewLab(dept.phase) }))
    .sort((a, b) => Number(a.preview) - Number(b.preview) || a.name.localeCompare(b.name));

  const best = new Map<number, { id: number; n: number }>();
  for (const row of usage) {
    const current = best.get(row.departmentId);
    if (row.procedureTypeId != null && (!current || row.n > current.n)) {
      best.set(row.departmentId, { id: row.procedureTypeId, n: row.n });
    }
  }
  const commonProcedure: Record<number, number> = {};
  for (const lab of labs) {
    const fallback = procRows.find((proc) => proc.departmentId === lab.id);
    const pick = best.get(lab.id)?.id ?? fallback?.id;
    if (pick != null) commonProcedure[lab.id] = pick;
  }

  return {
    labs,
    rooms: roomRows.map(({ id, departmentId, name }) => ({ id, departmentId, name })),
    procedures: procRows.map(({ id, departmentId, name }) => ({ id, departmentId, name })),
    last: lastRows[0] ?? null,
    commonProcedure,
  };
}

const optionalPositiveInt = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}, z.number().int().positive().optional());

export const openInRoomSchema = z.object({
  departmentId: z.coerce.number().int().positive(),
  roomId: z.coerce.number().int().positive(),
  procedureTypeId: optionalPositiveInt,
});

export type OpenOrResumeResult = {
  resumed: boolean;
  caseRow: NonNullable<Awaited<ReturnType<typeof getCase>>>;
};

/** One open case per room: an existing open case in the room is returned instead of a new one. */
export async function openOrResumeCase(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
): Promise<OpenOrResumeResult> {
  const data = openInRoomSchema.parse(input);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, data.roomId)).limit(1);
  if (!room || room.departmentId !== data.departmentId) {
    throw new Error("That room is not in the selected lab");
  }
  if (data.procedureTypeId != null) {
    const [proc] = await db
      .select()
      .from(procedureTypes)
      .where(eq(procedureTypes.id, data.procedureTypeId))
      .limit(1);
    if (!proc || proc.departmentId !== data.departmentId) {
      throw new Error("That procedure type is not in the selected lab");
    }
  }

  const [existing] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.roomId, data.roomId), eq(cases.status, "open")))
    .orderBy(desc(cases.id))
    .limit(1);
  if (existing) {
    const caseRow = await getCase(existing.id, db);
    return { resumed: true, caseRow: caseRow! };
  }

  const row = await openCase(data, userId, db);
  const caseRow = await getCase(row.id, db);
  return { resumed: false, caseRow: caseRow! };
}
