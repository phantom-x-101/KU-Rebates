import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cases } from "@/db/schema";
import { loadCaseOpenOptions, openOrResumeCase } from "@/lib/case-open";
import { closeCase } from "@/lib/cases";

describe("open case by lab and room", () => {
  let dbPath: string;
  let prevPath: string | undefined;
  let sqlite: { close: () => void } | null = null;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-case-open-${Date.now()}-${Math.random()}.sqlite`);
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
    sqlite?.close();
    sqlite = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    if (prevPath === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prevPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("resumes the open case in a room instead of creating a second one", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const openInRoom = async (roomId: number) =>
      db
        .select()
        .from(cases)
        .where(and(eq(cases.roomId, roomId), eq(cases.status, "open")));

    const first = await openOrResumeCase(
      { departmentId: 1, roomId: 2, procedureTypeId: 1 },
      1,
      db,
    );
    expect(first.resumed).toBe(false);
    expect(first.caseRow.departmentName).toBe("EP lab");
    expect(first.caseRow.roomName).toBe("EP 2");
    expect(first.caseRow.procedureTypeName).toBe("ablation");

    const again = await openOrResumeCase(
      { departmentId: 1, roomId: 2, procedureTypeId: 2 },
      2,
      db,
    );
    expect(again.resumed).toBe(true);
    expect(again.caseRow.id).toBe(first.caseRow.id);
    expect(await openInRoom(2)).toHaveLength(1);

    const otherRoom = await openOrResumeCase({ departmentId: 1, roomId: 1 }, 1, db);
    expect(otherRoom.resumed).toBe(false);
    expect(otherRoom.caseRow.id).not.toBe(first.caseRow.id);

    await closeCase(first.caseRow.id, 1, db);
    const afterClose = await openOrResumeCase({ departmentId: 1, roomId: 2 }, 1, db);
    expect(afterClose.resumed).toBe(false);
    expect(afterClose.caseRow.id).not.toBe(first.caseRow.id);
    expect(await openInRoom(2)).toHaveLength(1);
  });

  it("rejects a room from another lab and remembers each user's last choice", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    sqlite = created.sqlite;
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    await expect(
      openOrResumeCase({ departmentId: 1, roomId: 3 }, 1, db),
    ).rejects.toThrow(/not in the selected lab/);

    const options = await loadCaseOpenOptions(2, db);
    const cath = options.labs.find((lab) => lab.name === "Cath lab");
    expect(cath?.preview).toBe(true);
    expect(options.labs.find((lab) => lab.name === "EP lab")?.preview).toBe(false);
    expect(options.labs.some((lab) => lab.name === "Ortho")).toBe(false);
    expect(
      options.rooms.filter((room) => room.departmentId === cath!.id).map((r) => r.name),
    ).toEqual(["Cath 1", "Cath 2"]);
    expect(options.last).toBeNull();
    expect(options.commonProcedure[1]).toBeDefined();

    await openOrResumeCase({ departmentId: 2, roomId: 4, procedureTypeId: 6 }, 2, db);
    const remembered = await loadCaseOpenOptions(2, db);
    expect(remembered.last).toEqual({ departmentId: 2, roomId: 4, procedureTypeId: 6 });

    const alex = await loadCaseOpenOptions(1, db);
    expect(alex.last?.departmentId).toBe(1);
  });
});
