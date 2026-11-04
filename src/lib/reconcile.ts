import { and, eq, lt } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { appSettings, cases, exceptions } from "@/db/schema";
import { audit } from "@/lib/audit";
import { listCasePullLines } from "@/lib/cases";

export const DEFAULT_CLOSEOUT_TIMEOUT_HOURS = 24;
export const CLOSEOUT_TIMEOUT_SETTING_KEY = "case_closeout_timeout_hours";

export type ReconcileLine = {
  productId: number;
  lot: string | null;
  expiry: string | null;
  locationId: number | null;
  taken: number;
  used: number;
  wasted: number;
  returned: number;
  accounted: number;
  gap: number;
};

export type CaseReconciliation = {
  caseId: number;
  taken: number;
  used: number;
  wasted: number;
  returned: number;
  accounted: number;
  gap: number;
  balanced: boolean;
  lines: ReconcileLine[];
};

/**
 * The check: taken = used + wasted + returned.
 * `taken` is quantity pulled for the case.
 */
export function summarizeFromCounts(input: {
  taken: number;
  used: number;
  wasted: number;
  returned: number;
}): Omit<CaseReconciliation, "caseId" | "lines"> {
  const accounted = input.used + input.wasted + input.returned;
  const gap = input.taken - accounted;
  return {
    taken: input.taken,
    used: input.used,
    wasted: input.wasted,
    returned: input.returned,
    accounted,
    gap,
    balanced: gap === 0,
  };
}

export async function reconcileCase(
  caseId: number,
  db: AppDb = getDb(),
): Promise<CaseReconciliation> {
  const lines = await listCasePullLines(caseId, db);
  const reconcileLines: ReconcileLine[] = lines.map((l) => {
    const accounted = l.used + l.wasted + l.returned;
    return {
      productId: l.productId,
      lot: l.lot,
      expiry: l.expiry,
      locationId: l.locationId,
      taken: l.pulled,
      used: l.used,
      wasted: l.wasted,
      returned: l.returned,
      accounted,
      gap: l.pulled - accounted,
    };
  });

  const totals = reconcileLines.reduce(
    (acc, l) => {
      acc.taken += l.taken;
      acc.used += l.used;
      acc.wasted += l.wasted;
      acc.returned += l.returned;
      return acc;
    },
    { taken: 0, used: 0, wasted: 0, returned: 0 },
  );

  const summary = summarizeFromCounts(totals);
  return {
    caseId,
    ...summary,
    lines: reconcileLines,
  };
}

/**
 * For each gapped line, ensure an open taken_not_scanned_or_returned exception
 * with source_container = 1.
 */
export async function createGapExceptions(
  caseId: number,
  userId: number | null,
  db: AppDb = getDb(),
) {
  const recon = await reconcileCase(caseId, db);
  const created: number[] = [];

  for (const line of recon.lines) {
    if (line.gap <= 0) continue;

    const existing = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.sourceContainer, 1),
          eq(exceptions.productId, line.productId),
          eq(exceptions.status, "open"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    const [row] = await db
      .insert(exceptions)
      .values({
        sourceContainer: 1,
        type: "taken_not_scanned_or_returned",
        productId: line.productId,
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
        action: "create_gap",
        detail: `case=${caseId} product=${line.productId} lot=${line.lot ?? ""} gap=${line.gap} taken=${line.taken} used=${line.used} wasted=${line.wasted} returned=${line.returned}`,
      },
      db,
    );
    created.push(row.id);
  }

  return { reconciliation: recon, createdExceptionIds: created };
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

/**
 * Open cases older than the configured timeout get gap exceptions created.
 */
export async function reconcileTimedOutOpenCases(
  userId: number | null,
  now: Date = new Date(),
  db: AppDb = getDb(),
) {
  const hours = await getCloseoutTimeoutHours(db);
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  const openCases = await db
    .select({ id: cases.id, openedAt: cases.openedAt })
    .from(cases)
    .where(and(eq(cases.status, "open"), lt(cases.openedAt, cutoff)));

  const results = [];
  for (const c of openCases) {
    const r = await createGapExceptions(c.id, userId, db);
    results.push({ caseId: c.id, ...r });
  }
  return { hours, cutoff, results };
}
