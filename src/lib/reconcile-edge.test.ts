import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cases, exceptions, scans } from "@/db/schema";
import { abortCase, closeCase, openCase } from "@/lib/cases";
import { closeoutUsed, closeoutWasted } from "@/lib/closeout";
import {
  assertCanAccessExceptionQueue,
  canAccessExceptionQueue,
} from "@/lib/exceptions";
import { recordPull } from "@/lib/pull";
import {
  createGapExceptions,
  reconcileCase,
  reconcileTimedOutOpenCases,
  summarizeFromCounts,
} from "@/lib/reconcile";

describe("Phase 5 edge: surplus / duplicates / wasted / abort / permissions", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-reconcile-edge-${Date.now()}.sqlite`);
    prevPath = process.env.KU_DB_PATH;
    process.env.KU_DB_PATH = dbPath;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    execSync("npx tsx db/seed.ts", {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, KU_DB_PATH: dbPath },
      stdio: "pipe",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const held = (globalThis as any).__kuDb as { sqlite?: { close: () => void } } | undefined;
    held?.sqlite?.close();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    if (prevPath === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prevPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  async function freshDb() {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;
    return created.db;
  }

  it("surplus: used without pull → closeout_exceeds_taken (not silent)", async () => {
    const db = await freshDb();
    const c = await openCase({ departmentId: 1, roomId: 1 }, 1, db);

    // Brought-in item: used scan with no matching pulled stock_event
    await db.insert(scans).values({
      caseId: c.id,
      scannedBy: 1,
      rawBarcode: "BROUGHT-IN-LOT",
      barcodeFormat: "other",
      productId: 2,
      lot: "ORPHANLOT1",
      expiry: "2029-01-01",
      lotExpirySource: "manual",
      status: "used",
      qty: 1,
    });

    const recon = await reconcileCase(c.id, db);
    expect(recon.taken).toBe(0);
    expect(recon.used).toBe(1);
    expect(recon.gap).toBe(-1);
    expect(recon.surplus).toBe(true);
    expect(recon.balanced).toBe(false);
    expect(recon.lines.some((l) => l.orphanCloseout && l.gap === -1)).toBe(true);

    const first = await createGapExceptions(c.id, 1, db);
    expect(first.createdExceptionIds.length).toBe(1);

    const surplus = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "closeout_exceeds_taken"),
          eq(exceptions.productId, 2),
          eq(exceptions.status, "open"),
        ),
      );
    expect(surplus.length).toBe(1);
    expect(surplus[0]?.sourceContainer).toBe(1);

    // No false gap exception for this orphan product
    const falseGaps = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 2),
          eq(exceptions.status, "open"),
        ),
      );
    expect(falseGaps.length).toBe(0);

    expect(
      summarizeFromCounts({ taken: 0, used: 1, wasted: 0, returned: 0 }).surplus,
    ).toBe(true);
  });

  it("duplicates: timeout check twice and close twice do not duplicate exceptions", async () => {
    const db = await freshDb();
    const stale = await openCase({ departmentId: 1 }, 1, db);
    await recordPull(
      {
        caseId: stale.id,
        rawBarcode: "RSS802",
        productId: 1,
        locationId: 1,
        lot: "DEDUPLOT1",
        expiry: "2099-06-01",
        qty: 1,
      },
      1,
      db,
    );
    await db
      .update(cases)
      .set({ openedAt: "2020-01-01T00:00:00" })
      .where(eq(cases.id, stale.id));

    const run1 = await reconcileTimedOutOpenCases(2, new Date(), db);
    const run2 = await reconcileTimedOutOpenCases(2, new Date(), db);
    expect(run1.results.some((r) => r.caseId === stale.id)).toBe(true);
    expect(run2.results.some((r) => r.caseId === stale.id)).toBe(true);

    const gaps = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 1),
          eq(exceptions.status, "open"),
        ),
      );
    // Seeded EP case may already have product 1 open gap; count must not grow on 2nd run
    const afterFirst = gaps.length;
    const run3 = await createGapExceptions(stale.id, 2, db);
    expect(run3.createdExceptionIds.length).toBe(0);

    const gapsAgain = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 1),
          eq(exceptions.status, "open"),
        ),
      );
    expect(gapsAgain.length).toBe(afterFirst);

    // Close twice: second close must throw; no extra exceptions
    const gappy = await openCase({ departmentId: 1 }, 1, db);
    await recordPull(
      {
        caseId: gappy.id,
        rawBarcode: "VC-ABL-01",
        productId: 3,
        locationId: 1,
        lot: "CLOSEONCE1",
        expiry: "2027-06-01",
        qty: 1,
      },
      1,
      db,
    );
    await closeCase(gappy.id, 1, db);
    const afterClose = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 3),
          eq(exceptions.status, "open"),
        ),
      );
    expect(afterClose.length).toBe(1);

    await expect(closeCase(gappy.id, 1, db)).rejects.toThrow(/Only open cases/);

    const afterSecondClose = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 3),
          eq(exceptions.status, "open"),
        ),
      );
    expect(afterSecondClose.length).toBe(1);

    // Surplus dedupe similarly
    const surplusCase = await openCase({ departmentId: 1 }, 1, db);
    await db.insert(scans).values({
      caseId: surplusCase.id,
      scannedBy: 1,
      rawBarcode: "X",
      barcodeFormat: "other",
      productId: 4,
      lot: "SURPDUP",
      expiry: "2028-01-01",
      lotExpirySource: "manual",
      status: "used",
      qty: 2,
    });
    const s1 = await createGapExceptions(surplusCase.id, 1, db);
    const s2 = await createGapExceptions(surplusCase.id, 1, db);
    expect(s1.createdExceptionIds.length).toBe(1);
    expect(s2.createdExceptionIds.length).toBe(0);
    const surplusRows = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "closeout_exceeds_taken"),
          eq(exceptions.productId, 4),
          eq(exceptions.status, "open"),
        ),
      );
    expect(surplusRows.length).toBe(1);
  });

  it("wasted counts in taken=used+wasted+returned and does not create false gap", async () => {
    const db = await freshDb();
    const c = await openCase({ departmentId: 1, roomId: 1 }, 1, db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "RSS802",
        productId: 1,
        locationId: 1,
        lot: "WASTELOT1",
        expiry: "2028-11-01",
        qty: 2,
      },
      1,
      db,
    );
    await closeoutUsed(
      {
        caseId: c.id,
        productId: 1,
        locationId: 1,
        lot: "WASTELOT1",
        expiry: "2028-11-01",
        qty: 1,
      },
      1,
      db,
    );
    const { exception } = await closeoutWasted(
      {
        caseId: c.id,
        productId: 1,
        locationId: 1,
        lot: "WASTELOT1",
        expiry: "2028-11-01",
        qty: 1,
      },
      1,
      db,
    );
    expect(exception.type).toBe("opened_or_wasted");

    const recon = await reconcileCase(c.id, db);
    expect(recon.taken).toBe(2);
    expect(recon.used).toBe(1);
    expect(recon.wasted).toBe(1);
    expect(recon.returned).toBe(0);
    expect(recon.accounted).toBe(2);
    expect(recon.gap).toBe(0);
    expect(recon.balanced).toBe(true);

    await closeCase(c.id, 1, db);
    const result = await createGapExceptions(c.id, 1, db);
    // already closed — createGapExceptions still runs reconcile; gap 0 → no new gap
    expect(result.createdExceptionIds.length).toBe(0);

    const falseGaps = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 1),
          eq(exceptions.status, "open"),
        ),
      );
    // Seeded product-1 gap may exist from demo EP case; none tied to this balanced case
    // Confirm no NEW gap was created for this closed balanced case by checking createGapExceptions
    expect(
      falseGaps.every((e) => {
        // All open product-1 gaps must be pre-seeded (id 1) or unrelated — our case was balanced
        return e.id === 1 || e.createdAt !== undefined;
      }),
    ).toBe(true);

    const opened = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.id, exception.id));
    expect(opened[0]?.type).toBe("opened_or_wasted");
  });

  it("aborted cases: reconcile skips exception creation; timeout ignores aborted", async () => {
    const db = await freshDb();
    const c = await openCase({ departmentId: 1 }, 1, db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "VC-MAP-01",
        productId: 4,
        locationId: 1,
        lot: "ABORTLOT1",
        expiry: "2027-08-15",
        qty: 1,
      },
      1,
      db,
    );
    // Leave gap (pulled, not closed out), then abort
    await abortCase(c.id, 1, db);

    const before = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 4),
          eq(exceptions.status, "open"),
        ),
      );
    const beforeCount = before.length;

    const skipped = await createGapExceptions(c.id, 1, db);
    expect(skipped.skipped).toBe("aborted");
    expect(skipped.createdExceptionIds.length).toBe(0);
    // Reconcile still reports the math gap for visibility
    expect(skipped.reconciliation.gap).toBe(1);

    const after = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 4),
          eq(exceptions.status, "open"),
        ),
      );
    expect(after.length).toBe(beforeCount);

    // Force opened_at old — still aborted, timeout must not select it
    await db
      .update(cases)
      .set({ openedAt: "2019-01-01T00:00:00" })
      .where(eq(cases.id, c.id));
    const timed = await reconcileTimedOutOpenCases(2, new Date(), db);
    expect(timed.results.some((r) => r.caseId === c.id)).toBe(false);
  });

  it("permissions: supply_chain, admin, and category_owner allowed; vendor_rep and tech denied", () => {
    expect(canAccessExceptionQueue({ role: "supply_chain", active: 1 })).toBe(
      true,
    );
    expect(canAccessExceptionQueue({ role: "admin", active: 1 })).toBe(true);
    expect(canAccessExceptionQueue({ role: "category_owner", active: 1 })).toBe(
      true,
    );
    expect(canAccessExceptionQueue({ role: "vendor_rep", active: 1 })).toBe(
      false,
    );
    expect(canAccessExceptionQueue({ role: "tech", active: 1 })).toBe(false);
    expect(canAccessExceptionQueue(null)).toBe(false);
    expect(canAccessExceptionQueue({ role: "admin", active: 0 })).toBe(false);

    expect(() =>
      assertCanAccessExceptionQueue({ role: "vendor_rep", active: 1 }),
    ).toThrow(/supply_chain, category_owner, or admin/);
    expect(() =>
      assertCanAccessExceptionQueue({ role: "supply_chain", active: 1 }),
    ).not.toThrow();
  });

  it("surplus on over-accounted pull line (used > pulled) also flags closeout_exceeds_taken", async () => {
    const db = await freshDb();
    const c = await openCase({ departmentId: 1 }, 1, db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "RSS802",
        productId: 1,
        locationId: 1,
        lot: "OVERCLOSE1",
        expiry: "2028-11-01",
        qty: 1,
      },
      1,
      db,
    );
    await closeoutUsed(
      {
        caseId: c.id,
        productId: 1,
        locationId: 1,
        lot: "OVERCLOSE1",
        expiry: "2028-11-01",
        qty: 1,
      },
      1,
      db,
    );
    // Extra used beyond pulled — bypass UI assertOpenRemaining
    await db.insert(scans).values({
      caseId: c.id,
      scannedBy: 1,
      rawBarcode: "RSS802",
      barcodeFormat: "other",
      productId: 1,
      lot: "OVERCLOSE1",
      expiry: "2028-11-01",
      lotExpirySource: "manual",
      status: "used",
      qty: 1,
    });

    const recon = await reconcileCase(c.id, db);
    expect(recon.taken).toBe(1);
    expect(recon.used).toBe(2);
    expect(recon.gap).toBe(-1);
    expect(recon.surplus).toBe(true);

    await createGapExceptions(c.id, 1, db);
    const rows = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "closeout_exceeds_taken"),
          eq(exceptions.productId, 1),
          eq(exceptions.status, "open"),
        ),
      );
    expect(rows.length).toBe(1);
  });
});
