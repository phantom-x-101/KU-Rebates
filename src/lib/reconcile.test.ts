import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, cases, exceptions } from "@/db/schema";
import { abortCase, closeCase, openCase } from "@/lib/cases";
import { closeoutReturned } from "@/lib/closeout";
import {
  assertCanAccessExceptionQueue,
  canAccessExceptionQueue,
  listExceptions,
  resolveException,
} from "@/lib/exceptions";
import { recordPull } from "@/lib/pull";
import {
  CASE_TIMEOUT_ACTION,
  flagCasesOpenPastTimeout,
  reconcileCase,
  summarizeFromCounts,
} from "@/lib/reconcile";

describe("check: taken = returned + used", () => {
  it("counts anything not returned as used", () => {
    expect(summarizeFromCounts({ taken: 3, returned: 1 })).toEqual({
      taken: 3,
      returned: 1,
      used: 2,
    });
    expect(summarizeFromCounts({ taken: 2, returned: 2 }).used).toBe(0);
    expect(summarizeFromCounts({ taken: 0, returned: 0 }).used).toBe(0);
  });
});

describe("exception queue permissions", () => {
  it("allows supply_chain, admin, category_owner and vendor_rep; denies tech", () => {
    expect(canAccessExceptionQueue({ role: "supply_chain", active: 1 })).toBe(true);
    expect(canAccessExceptionQueue({ role: "admin", active: 1 })).toBe(true);
    expect(canAccessExceptionQueue({ role: "category_owner", active: 1 })).toBe(true);
    expect(canAccessExceptionQueue({ role: "vendor_rep", active: 1 })).toBe(true);
    expect(canAccessExceptionQueue({ role: "tech", active: 1 })).toBe(false);
    expect(canAccessExceptionQueue(null)).toBe(false);
    expect(canAccessExceptionQueue({ role: "admin", active: 0 })).toBe(false);
    expect(() =>
      assertCanAccessExceptionQueue({ role: "tech", active: 1 }),
    ).toThrow(/supply_chain, category_owner, admin, or vendor_rep/);
  });
});

describe("reconcile and timeout exceptions", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-reconcile-test-${Date.now()}.sqlite`);
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

  async function staleCase(db: Awaited<ReturnType<typeof freshDb>>) {
    const c = await openCase({ departmentId: 1, roomId: 1 }, 1, db);
    await db
      .update(cases)
      .set({ openedAt: "2020-01-01T00:00:00" })
      .where(eq(cases.id, c.id));
    return c;
  }

  it("seeded first EP case: 2 taken, 1 returned, 1 used; no gap exceptions", async () => {
    const db = await freshDb();
    const recon = await reconcileCase(1, db);
    expect(recon).toMatchObject({ taken: 2, returned: 1, used: 1 });

    const all = await db.select({ type: exceptions.type }).from(exceptions);
    expect(
      all.every((row) =>
        ["expired_on_shelf", "case_open_past_timeout", "bill_only_unmapped"].includes(
          row.type,
        ),
      ),
    ).toBe(true);
  });

  it("closing a case with unreturned items creates no exception", async () => {
    const db = await freshDb();
    const c = await openCase({ departmentId: 1, roomId: 1, procedureTypeId: 1 }, 1, db);
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "RSS802",
        productId: 1,
        locationId: 1,
        lot: "0001681425",
        expiry: "2028-11-01",
        qty: 2,
      },
      1,
      db,
    );
    await recordPull(
      {
        caseId: c.id,
        rawBarcode: "VC-MAP-01",
        productId: 4,
        locationId: 1,
        lot: "VCMAP2001",
        expiry: "2027-08-15",
        qty: 1,
      },
      1,
      db,
    );
    await closeoutReturned(
      {
        caseId: c.id,
        productId: 4,
        locationId: 1,
        lot: "VCMAP2001",
        expiry: "2027-08-15",
        qty: 1,
      },
      1,
      db,
    );

    const before = (await db.select().from(exceptions)).length;
    await closeCase(c.id, 1, db);
    expect((await db.select().from(exceptions)).length).toBe(before);
    expect(await reconcileCase(c.id, db)).toMatchObject({
      taken: 3,
      returned: 1,
      used: 2,
    });
    await expect(closeCase(c.id, 1, db)).rejects.toThrow(/Only open cases/);
  });

  it("a case open past the timeout gets one exception, audited and linked to the case", async () => {
    const db = await freshDb();
    const stale = await staleCase(db);
    const recent = await openCase({ departmentId: 1, roomId: 2 }, 1, db);

    const run1 = await flagCasesOpenPastTimeout(2, new Date(), db);
    expect(run1.hours).toBe(24);
    expect(run1.staleCaseIds).toContain(stale.id);
    expect(run1.staleCaseIds).not.toContain(recent.id);
    expect(run1.createdExceptionIds).toHaveLength(1);

    const [row] = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.id, run1.createdExceptionIds[0]!));
    expect(row).toMatchObject({
      type: "case_open_past_timeout",
      sourceContainer: 1,
      status: "open",
      productId: null,
    });
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "exceptions"), eq(auditLog.entityId, row!.id)));
    expect(audits[0]?.action).toBe(CASE_TIMEOUT_ACTION);
    expect(audits[0]?.detail).toMatch(new RegExp(`^case=${stale.id} `));

    const listed = await listExceptions({ type: "case_open_past_timeout" }, db);
    expect(listed.find((e) => e.id === row!.id)?.caseId).toBe(stale.id);

    const run2 = await flagCasesOpenPastTimeout(2, new Date(), db);
    expect(run2.createdExceptionIds).toHaveLength(0);

    await resolveException(
      { exceptionId: row!.id, resolutionNote: "Tech closed it late" },
      2,
      db,
    );
    const run3 = await flagCasesOpenPastTimeout(2, new Date(), db);
    expect(run3.createdExceptionIds).toHaveLength(0);
  });

  it("closed and aborted cases are never flagged; the seeded stale case is already flagged", async () => {
    const db = await freshDb();
    const closed = await staleCase(db);
    await closeCase(closed.id, 1, db);
    const aborted = await openCase({ departmentId: 1, roomId: 2 }, 1, db);
    await abortCase(aborted.id, 1, db);
    await db
      .update(cases)
      .set({ openedAt: "2019-01-01T00:00:00" })
      .where(eq(cases.id, aborted.id));

    const run = await flagCasesOpenPastTimeout(2, new Date(), db);
    expect(run.staleCaseIds).not.toContain(closed.id);
    expect(run.staleCaseIds).not.toContain(aborted.id);
    expect(run.createdExceptionIds).toHaveLength(0);

    const seeded = await listExceptions({ type: "case_open_past_timeout", status: "open" }, db);
    expect(seeded).toHaveLength(1);
    expect(run.staleCaseIds).toContain(seeded[0]!.caseId);
  });
});
