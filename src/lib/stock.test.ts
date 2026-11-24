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

    expect(byKey["1|0001681425"]).toBe(1);
    expect(byKey["2|G612C260420B"]).toBe(1);
    expect(byKey["2|DEMO-SOON"]).toBe(1);
    expect(byKey["3|0001476667"]).toBe(2);
    expect(byKey["3|DEMO-EXPIRED"]).toBe(1);
    expect(byKey["4|31982149L"]).toBe(1);
    expect(byKey["5|SPD-PLACEHOLDER-1"]).toBe(1);
  });
});
