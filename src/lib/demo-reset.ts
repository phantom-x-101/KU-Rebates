import { getDb, getSqlite } from "@/db";
import { audit } from "@/lib/audit";
import { seedDemo } from "../../db/seed";

/**
 * Wipe every application table and insert the clean demo seed.
 * Deletes rows on the open connection so a running server is not locked
 * out of the SQLite file.
 */
export async function resetDemoData(userId: number) {
  const sqlite = getSqlite();
  sqlite.pragma("foreign_keys = OFF");
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];

  const wipe = sqlite.transaction(() => {
    for (const table of tables) {
      sqlite.prepare(`DELETE FROM "${table.name}"`).run();
    }
  });
  wipe();
  sqlite.pragma("foreign_keys = ON");

  const db = getDb();
  await seedDemo(db);
  await audit(
    {
      userId,
      container: 1,
      entity: "demo",
      action: "reset",
      detail: "Restored clean seeded demo state",
    },
    db,
  );
}
