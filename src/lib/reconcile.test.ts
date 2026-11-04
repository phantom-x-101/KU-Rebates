import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, exceptions } from "@/db/schema";
import { closeCase, openCase } from "@/lib/cases";
import { closeoutReturned, closeoutUsed } from "@/lib/closeout";
import { recordPull } from "@/lib/pull";
import {
  reconcileCase,
  reconcileTimedOutOpenCases,
  summarizeFromCounts,
} from "@/lib/reconcile";
import { resolveException, listExceptions } from "@/lib/exceptions";

describe("reconcile taken = used + wasted + returned", () => {
  it("passes the 3 = 2 + 1 example", () => {
    const r = summarizeFromCounts({
      taken: 3,
      used: 2,
      wasted: 0,
      returned: 1,
    });
    expect(r.accounted).toBe(3);
    expect(r.gap).toBe(0);
    expect(r.balanced).toBe(true);
  });

  it("flags a gap when taken exceeds accounted", () => {
    const r = summarizeFromCounts({
      taken: 3,
      used: 1,
      wasted: 0,
      returned: 1,
    });
    expect(r.gap).toBe(1);
    expect(r.balanced).toBe(false);
  });
});

describe("reconcileCase + gap exceptions", () => {
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
    (globalThis as any).__kuDb = undefined;
    if (prevPath === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prevPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("seeded EP case has a gap of 1 (extra sheath)", async () => {
    const { createDb } = await import("@/db");
    const { db } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite: undefined };

    const recon = await reconcileCase(1, db);
    expect(recon.taken).toBe(6);
    expect(recon.used + recon.wasted).toBe(4);
    expect(recon.returned).toBe(1);
    expect(recon.gap).toBe(1);
    expect(recon.balanced).toBe(false);

    const seeded = await listExceptions(
      { type: "taken_not_scanned_or_returned", status: "open" },
      db,
    );
    expect(seeded.some((e) => e.productId === 1)).toBe(true);
  });

  it("closing a case with a gap creates taken_not_scanned_or_returned", async () => {
    const { createDb } = await import("@/db");
    const { db } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite: undefined };

    const c = await openCase(
      { departmentId: 1, roomId: 1, procedureTypeId: 1 },
      1,
      db,
    );
    // 3 pulled, 2 used + 1 returned → balanced (3=2+1)
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
    await closeoutUsed(
      {
        caseId: c.id,
        productId: 1,
        locationId: 1,
        lot: "0001681425",
        expiry: "2028-11-01",
        qty: 2,
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
    const balanced = await reconcileCase(c.id, db);
    expect(balanced.taken).toBe(3);
    expect(balanced.used).toBe(2);
    expect(balanced.returned).toBe(1);
    expect(balanced.balanced).toBe(true);

    // Separate case with intentional gap
    const gappy = await openCase({ departmentId: 1, roomId: 1 }, 1, db);
    await recordPull(
      {
        caseId: gappy.id,
        rawBarcode: "VC-ABL-01",
        productId: 3,
        locationId: 1,
        lot: "VCABL1001",
        expiry: "2027-06-01",
        qty: 1,
      },
      1,
      db,
    );
    // no close-out
    await closeCase(gappy.id, 1, db);

    const gaps = await db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.type, "taken_not_scanned_or_returned"),
          eq(exceptions.productId, 3),
          eq(exceptions.status, "open"),
        ),
      );
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps[0]?.sourceContainer).toBe(1);
  });

  it("resolving seeded gap writes audit; timeout creates gaps for stale open cases", async () => {
    const { createDb } = await import("@/db");
    const { db } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite: undefined };

    const openGaps = await listExceptions(
      { type: "taken_not_scanned_or_returned", status: "open" },
      db,
    );
    const seeded = openGaps.find((e) => e.id === 1);
    expect(seeded).toBeTruthy();

    await resolveException(
      {
        exceptionId: 1,
        resolutionNote: "Confirmed sheath used; documented after review",
      },
      2,
      db,
    );

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entity, "exceptions"));
    expect(
      audits.some(
        (a) =>
          a.entityId === 1 &&
          a.action === "resolve" &&
          a.detail?.includes("Confirmed sheath used"),
      ),
    ).toBe(true);

    // Stale open case: open with old openedAt via direct insert path — use createGap after timeout helper
    const stale = await openCase({ departmentId: 1 }, 1, db);
    await recordPull(
      {
        caseId: stale.id,
        rawBarcode: "RSS802",
        productId: 1,
        locationId: 1,
        lot: "EXPIRINGSOON1",
        expiry: "2099-01-01",
        qty: 1,
      },
      1,
      db,
    );
    // Force opened_at into the past
    const { cases } = await import("@/db/schema");
    await db
      .update(cases)
      .set({ openedAt: "2020-01-01T00:00:00" })
      .where(eq(cases.id, stale.id));

    const timed = await reconcileTimedOutOpenCases(2, new Date(), db);
    expect(timed.hours).toBe(24);
    expect(timed.results.some((r) => r.caseId === stale.id)).toBe(true);
  });
});
