import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

describe("demo reset", () => {
  const dbPath = path.join(os.tmpdir(), `ku-reset-${Date.now()}.sqlite`);
  const prev = process.env.KU_DB_PATH;
  let sqlite: { close: () => void } | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    if (prev === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prev;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("restores the seeded shelf in under 3 seconds", async () => {
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

    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const { resetDemoData } = await import("@/lib/demo-reset");
    const { stockOnHand } = await import("@/lib/stock");
    const started = Date.now();
    await resetDemoData(4);
    const ms = Date.now() - started;
    expect(ms).toBeLessThan(3000);

    const rows = await stockOnHand({}, created.db);
    const byLot = Object.fromEntries(rows.map((row) => [`${row.productId}|${row.lot}`, row.onHand]));
    expect(byLot["1|0001681425"]).toBe(1);
    expect(byLot["2|EXPIRED-SHELF"]).toBe(1);
    expect(byLot["1|EXPIRINGSOON1"]).toBe(1);
  });
});
