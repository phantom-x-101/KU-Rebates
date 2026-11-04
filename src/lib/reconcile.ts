import { and, eq, lt } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { appSettings, cases, exceptions, scans } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCase, listCasePullLines } from "@/lib/cases";

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
  /** taken - accounted; positive = missing close-out; negative = surplus over pulled */
  gap: number;
  orphanCloseout?: boolean;
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
  surplus: boolean;
  lines: ReconcileLine[];
};

/**
 * The check: taken = used + wasted + returned.
 * `taken` is quantity pulled for the case.
 * Negative gap means surplus close-out (e.g. used without a matching pull).
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
    surplus: gap < 0,
  };
}

function lineKey(productId: number, lot: string | null, expiry: string | null) {
  return `${productId}|${lot ?? ""}|${expiry ?? ""}`;
}

export async function reconcileCase(
  caseId: number,
  db: AppDb = getDb(),
): Promise<CaseReconciliation> {
  const pullLines = await listCasePullLines(caseId, db);
  const reconcileLines: ReconcileLine[] = pullLines.map((l) => {
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

  // Orphan close-outs: scans used/wasted with no matching pull line
  // (e.g. brought-in item recorded as used without a pulled stock_event).
  const caseScans = await db.select().from(scans).where(eq(scans.caseId, caseId));
  const coveredKeys = new Set(
    reconcileLines.map((l) => lineKey(l.productId, l.lot, l.expiry)),
  );

  type OrphanAcc = {
    productId: number;
    lot: string | null;
    expiry: string | null;
    used: number;
    wasted: number;
  };
  const orphans = new Map<string, OrphanAcc>();

  for (const s of caseScans) {
    if (!s.productId) continue;
    if (s.status !== "used" && s.status !== "wasted") continue;
    const key = lineKey(s.productId, s.lot, s.expiry);
    if (coveredKeys.has(key)) continue;
    const cur =
      orphans.get(key) ??
      ({
        productId: s.productId,
        lot: s.lot,
        expiry: s.expiry,
        used: 0,
        wasted: 0,
      } satisfies OrphanAcc);
    if (s.status === "used") cur.used += s.qty;
    if (s.status === "wasted") cur.wasted += s.qty;
    orphans.set(key, cur);
  }

  for (const o of orphans.values()) {
    const accounted = o.used + o.wasted;
    reconcileLines.push({
      productId: o.productId,
      lot: o.lot,
      expiry: o.expiry,
      locationId: null,
      taken: 0,
      used: o.used,
      wasted: o.wasted,
      returned: 0,
      accounted,
      gap: 0 - accounted,
      orphanCloseout: true,
    });
  }

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

async function ensureException(opts: {
  type: "taken_not_scanned_or_returned" | "closeout_exceeds_taken";
  productId: number;
  caseId: number;
  userId: number | null;
  detail: string;
  db: AppDb;
}) {
  const existing = await opts.db
    .select()
    .from(exceptions)
    .where(
      and(
        eq(exceptions.type, opts.type),
        eq(exceptions.sourceContainer, 1),
        eq(exceptions.productId, opts.productId),
        eq(exceptions.status, "open"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0]!.id, created: false };
  }

  const [row] = await opts.db
    .insert(exceptions)
    .values({
      sourceContainer: 1,
      type: opts.type,
      productId: opts.productId,
      status: "open",
      ownerUserId: null,
    })
    .returning();

  await audit(
    {
      userId: opts.userId,
      container: 1,
      entity: "exceptions",
      entityId: row.id,
      action: opts.type === "closeout_exceeds_taken" ? "create_surplus" : "create_gap",
      detail: opts.detail,
    },
    opts.db,
  );
  return { id: row.id, created: true };
}

/**
 * For each unbalanced line:
 * - gap > 0 → taken_not_scanned_or_returned
 * - gap < 0 → closeout_exceeds_taken (surplus / used without pull)
 * Dedupes by open exception of that type+productId (no duplicates on re-run).
 * Aborted cases are skipped (no exceptions created).
 */
export async function createGapExceptions(
  caseId: number,
  userId: number | null,
  db: AppDb = getDb(),
) {
  const caseRow = await getCase(caseId, db);
  if (!caseRow) throw new Error("Case not found");
  if (caseRow.status === "aborted") {
    const reconciliation = await reconcileCase(caseId, db);
    return {
      reconciliation,
      createdExceptionIds: [] as number[],
      skipped: "aborted" as const,
    };
  }

  const recon = await reconcileCase(caseId, db);
  const created: number[] = [];

  for (const line of recon.lines) {
    if (line.gap === 0) continue;

    if (line.gap > 0) {
      const result = await ensureException({
        type: "taken_not_scanned_or_returned",
        productId: line.productId,
        caseId,
        userId,
        detail: `case=${caseId} product=${line.productId} lot=${line.lot ?? ""} gap=${line.gap} taken=${line.taken} used=${line.used} wasted=${line.wasted} returned=${line.returned}`,
        db,
      });
      if (result.created) created.push(result.id);
    } else {
      const result = await ensureException({
        type: "closeout_exceeds_taken",
        productId: line.productId,
        caseId,
        userId,
        detail: `case=${caseId} product=${line.productId} lot=${line.lot ?? ""} surplus=${-line.gap} taken=${line.taken} used=${line.used} wasted=${line.wasted} returned=${line.returned} orphan=${line.orphanCloseout ? 1 : 0}`,
        db,
      });
      if (result.created) created.push(result.id);
    }
  }

  return { reconciliation: recon, createdExceptionIds: created, skipped: null };
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
 * Open cases older than the configured timeout get gap/surplus exceptions.
 * Aborted and already-closed cases are not selected.
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
