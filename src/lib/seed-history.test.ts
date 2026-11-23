import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("busy EP lab seed", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-seed-history-${Date.now()}.sqlite`);
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

  it("builds a deterministic six-week lab and leaves today empty", async () => {
    const { createDb } = await import("@/db");
    const { stockOnHand } = await import("@/lib/stock");
    const { listReorderView } = await import("@/lib/reorder");
    const {
      cases,
      contractLineProducts,
      exceptions,
      productAccess,
      products,
      scans,
    } = await import("@/db/schema");
    const { db, sqlite } = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = { db, sqlite };

    const onHand = await stockOnHand({}, db);
    const byKey = Object.fromEntries(
      onHand.map((row) => [`${row.productId}|${row.lot}`, row.onHand]),
    );
    expect(byKey["1|0001681425"]).toBe(1);
    expect(byKey["4|EXPIRINGSOON1"]).toBe(1);
    expect(byKey["4|EXPIRED-SHELF"]).toBe(1);
    expect(byKey["2|G612C260420B"]).toBe(1);
    expect(byKey["25|0001476667"]).toBe(2);
    expect(byKey["26|31982149L"]).toBe(1);
    expect(byKey["27|SPD-PLACEHOLDER-1"]).toBe(1);
    expect(byKey["3|VCABL1001"]).toBe(1);
    expect(byKey["4|VCMAP2001"]).toBe(1);
    expect(byKey["4|VCMAP2002"]).toBe(2);
    expect(byKey["22|VGIMP9001"]).toBeGreaterThan(0);
    expect(byKey["14|VE-EXPIRED"]).toBe(1);
    expect(byKey["9|VD-SOON"]).toBe(1);
    expect(byKey["17|VF-SOON"]).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const caseRows = await db.select().from(cases);
    expect(caseRows.length).toBeGreaterThanOrEqual(40);
    expect(caseRows.filter((row) => row.openedAt.startsWith(today))).toHaveLength(0);
    expect(caseRows.filter((row) => row.status === "aborted")).toHaveLength(2);
    const openRows = caseRows.filter((row) => row.status === "open");
    expect(openRows).toHaveLength(1);
    expect(openRows[0]).toMatchObject({ departmentId: 2, roomId: 3 });
    expect(
      caseRows
        .filter((row) => row.status !== "open")
        .every(
          (row) =>
            row.departmentId === 1 &&
            (row.roomId === 1 || row.roomId === 2) &&
            row.procedureTypeId != null,
        ),
    ).toBe(true);

    const excRows = await db.select().from(exceptions);
    const ofType = (type: string) => excRows.filter((row) => row.type === type).length;
    expect(ofType("expired_on_shelf")).toBe(2);
    expect(ofType("case_open_past_timeout")).toBe(1);
    expect(ofType("bill_only_unmapped")).toBe(1);
    expect(excRows).toHaveLength(4);

    const scanRows = await db.select().from(scans);
    expect(scanRows.filter((row) => row.status === "wasted")).toHaveLength(0);

    const access = await db.select().from(productAccess);
    expect(access.filter((row) => row.accessMode === "brought_in_for_case")).toHaveLength(1);
    expect(access.filter((row) => row.accessMode === "not_kept_in_stock")).toHaveLength(1);

    const links = await db.select().from(contractLineProducts);
    const linked = new Set(links.map((row) => row.productId));
    expect(linked.has(27)).toBe(false);
    for (const id of [1, 2, 22, 25, 26]) expect(linked.has(id)).toBe(true);

    const catalog = await db.select().from(products);
    expect(catalog.length).toBeGreaterThanOrEqual(27);
    const real = new Map(
      [
        [1, "Terumo Pinnacle Introducer Sheath 8 Fr"],
        [2, "Cardiva Vascade MVP closure"],
        [25, "Terumo Pinnacle Introducer Sheath 11 Fr"],
        [26, "NuVision NAV Ultrasound Catheter"],
        [27, "Pack EP Lab SMALL DECA Cable"],
      ] as const,
    );
    for (const row of catalog) {
      const name = real.get(row.id as 1 | 2 | 25 | 26 | 27);
      if (name) expect(row.description).toBe(name);
      else expect(row.description.toLowerCase()).toContain("placeholder");
      expect(row.kuOwned).toBe(row.id === 27 ? 1 : 0);
    }

    const low = (await listReorderView(db))
      .filter((row) => row.lowStock)
      .map((row) => row.catalogNumber)
      .sort();
    expect(low).toEqual(["800-612C", "RSS802", "VD-SH-08"]);

    const start = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    );
    const expiring = onHand.filter((row) => {
      if (!row.expiry || row.onHand <= 0) return false;
      const days = (Date.parse(`${row.expiry}T00:00:00Z`) - start) / 86400000;
      return days >= 0 && days <= 30;
    });
    expect(expiring.length).toBeGreaterThanOrEqual(3);
    const expired = onHand.filter((row) => {
      if (!row.expiry || row.onHand <= 0) return false;
      return Date.parse(`${row.expiry}T00:00:00Z`) < start;
    });
    expect(expired.length).toBeGreaterThanOrEqual(2);
  });
});
