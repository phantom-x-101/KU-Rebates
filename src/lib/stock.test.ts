import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

describe("stockOnHand", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-stock-test-${Date.now()}.sqlite`);
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

  it("computes arrived + returned - pulled - expired for seed data", async () => {
    const { createDb } = await import("@/db");
    const { stockOnHand } = await import("@/lib/stock");
    const created = createDb(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const rows = await stockOnHand({}, created.db);
    const byKey = Object.fromEntries(
      rows.map((r) => [`${r.productId}|${r.lot}`, r.onHand]),
    );

    // Terumo RSS802 primary lot: arrived 3 - pulled 2 = 1
    expect(byKey["1|0001681425"]).toBe(1);
    // Expiring-soon lot untouched: 1
    expect(byKey["1|EXPIRINGSOON1"]).toBe(1);
    // Cardiva: arrived 2 - pulled 1 = 1
    expect(byKey["2|G612C260420B"]).toBe(1);
    // Ablation: arrived 2 - pulled 1 = 1
    expect(byKey["3|VCABL1001"]).toBe(1);
    // Mapping: arrived 3 - pulled 3 + returned 1 = 1 (extra pull is historical, not today)
    expect(byKey["4|VCMAP2001"]).toBe(1);
  });
});
