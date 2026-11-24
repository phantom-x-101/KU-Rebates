import { and, eq, sql } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { appSettings, auditLog, cases, exceptions, rooms } from "@/db/schema";
import { audit } from "@/lib/audit";
import { listCasePullLines } from "@/lib/cases";

export const DEFAULT_CLOSEOUT_TIMEOUT_HOURS = 24;
export const CLOSEOUT_TIMEOUT_SETTING_KEY = "case_closeout_timeout_hours";
export const CASE_TIMEOUT_ACTION = "create_case_timeout";

export type ReconcileLine = {
  productId: number;
  lot: string | null;
  expiry: string | null;
  locationId: number | null;
  taken: number;
  returned: number;
  /** Not returned = used. */
  used: number;
};

export type CaseReconciliation = {
  caseId: number;
  taken: number;
  returned: number;
  used: number;
  lines: ReconcileLine[];
};

/**
 * The check: taken = returned + used.
 * Used is what KU paid for (use scan minus later return).
 */
export function summarizeFromCounts(input: {
  taken: number;
  returned: number;
}): Omit<CaseReconciliation, "caseId" | "lines"> {
  return {
    taken: input.taken,
    returned: input.returned,
    used: Math.max(0, input.taken - input.returned),
  };
}

export async function reconcileCase(
  caseId: number,
  db: AppDb = getDb(),
): Promise<CaseReconciliation> {
  const pullLines = await listCasePullLines(caseId, db);
  const lines: ReconcileLine[] = pullLines.map((l) => ({
    productId: l.productId,
    lot: l.lot,
    expiry: l.expiry,
    locationId: l.locationId,
    taken: l.pulled,
    returned: l.returned,
    used: Math.max(0, l.pulled - l.returned),
  }));

  const totals = lines.reduce(
    (acc, l) => {
      acc.taken += l.taken;
      acc.returned += l.returned;
      return acc;
    },
    { taken: 0, returned: 0 },
  );

  return { caseId, ...summarizeFromCounts(totals), lines };
}

export async function getCloseoutTimeoutHours(db: AppDb = getDb()) {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, CLOSEOUT_TIMEOUT_SETTING_KEY))
    .limit(1);
  const n = row ? Number(row.value) : DEFAULT_CLOSEOUT_TIMEOUT_HOURS;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CLOSEOUT_TIMEOUT_HOURS;
}

export function caseIdFromDetail(detail: string | null): number | null {
  const match = detail?.match(/^case=(\d+)(?:\s|$)/);
  return match ? Number(match[1]) : null;
}

/**
 * One `case_open_past_timeout` exception per case still open after the
 * configured timeout. A case is flagged once, even after the row is resolved.
 */
export async function flagCasesOpenPastTimeout(
  userId: number | null,
  now: Date = new Date(),
  db: AppDb = getDb(),
) {
  const hours = await getCloseoutTimeoutHours(db);
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  const stale = await db
    .select({ id: cases.id, openedAt: cases.openedAt, roomName: rooms.name })
    .from(cases)
    .leftJoin(rooms, eq(cases.roomId, rooms.id))
    .where(
      and(
        eq(cases.status, "open"),
        sql`datetime(${cases.openedAt}) < datetime(${cutoff})`,
      ),
    );

  const createdExceptionIds: number[] = [];
  if (stale.length === 0) {
    return { hours, cutoff, staleCaseIds: [] as number[], createdExceptionIds };
  }

  const flagged = await db
    .select({ detail: auditLog.detail })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, "exceptions"),
        eq(auditLog.action, CASE_TIMEOUT_ACTION),
      ),
    );
  const flaggedCaseIds = new Set(
    flagged.map((row) => caseIdFromDetail(row.detail)).filter((id) => id !== null),
  );

  for (const c of stale) {
    if (flaggedCaseIds.has(c.id)) continue;
    const [row] = await db
      .insert(exceptions)
      .values({
        sourceContainer: 1,
        type: "case_open_past_timeout",
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
        action: CASE_TIMEOUT_ACTION,
        detail: `case=${c.id} room=${c.roomName ?? ""} opened=${c.openedAt} timeout=${hours}h`,
      },
      db,
    );
    createdExceptionIds.push(row.id);
  }

  return {
    hours,
    cutoff,
    staleCaseIds: stale.map((c) => c.id),
    createdExceptionIds,
  };
}
