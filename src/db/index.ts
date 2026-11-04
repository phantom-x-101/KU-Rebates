import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const defaultPath = path.join(process.cwd(), "data", "ku.sqlite");

export function createDb(dbPath: string = process.env.KU_DB_PATH ?? defaultPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export type AppDb = ReturnType<typeof createDb>["db"];

declare global {
  // eslint-disable-next-line no-var
  var __kuDb: ReturnType<typeof createDb> | undefined;
}

export function getDb() {
  if (!globalThis.__kuDb) {
    globalThis.__kuDb = createDb();
  }
  return globalThis.__kuDb.db;
}

export function getSqlite() {
  if (!globalThis.__kuDb) {
    globalThis.__kuDb = createDb();
  }
  return globalThis.__kuDb.sqlite;
}
