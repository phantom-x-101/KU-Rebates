import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { appSettings } from "@/db/schema";
import { audit } from "@/lib/audit";

export const DATAWEDGE_SOFT_TRIGGER_KEY = "datawedge_soft_trigger";
export const SCAN_DEBUG_KEY = "scan_debug";

export function parseSoftTriggerEnabled(value: string | null | undefined): boolean {
  return value === "on";
}

export function parseScanDebugEnabled(value: string | null | undefined): boolean {
  return value === "on";
}

export async function isSoftTriggerEnabled(db: AppDb = getDb()): Promise<boolean> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, DATAWEDGE_SOFT_TRIGGER_KEY))
    .limit(1);
  return parseSoftTriggerEnabled(row?.value);
}

async function upsertSetting(
  key: string,
  enabled: boolean,
  userId: number,
  db: AppDb,
) {
  const value = enabled ? "on" : "off";
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value },
    });
  await audit(
    {
      userId,
      container: 1,
      entity: "app_settings",
      action: "update",
      detail: `${key}=${value}`,
    },
    db,
  );
  return enabled;
}

export async function setSoftTriggerEnabled(
  enabled: boolean,
  userId: number,
  db: AppDb = getDb(),
): Promise<boolean> {
  return upsertSetting(DATAWEDGE_SOFT_TRIGGER_KEY, enabled, userId, db);
}

export async function isScanDebugEnabled(db: AppDb = getDb()): Promise<boolean> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SCAN_DEBUG_KEY))
    .limit(1);
  return parseScanDebugEnabled(row?.value);
}

export async function setScanDebugEnabled(
  enabled: boolean,
  userId: number,
  db: AppDb = getDb(),
): Promise<boolean> {
  return upsertSetting(SCAN_DEBUG_KEY, enabled, userId, db);
}
