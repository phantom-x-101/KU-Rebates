import { desc } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listRecentAudit(limit = 50, db: AppDb = getDb()) {
  return db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      userId: auditLog.userId,
      userName: users.name,
      container: auditLog.container,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      detail: auditLog.detail,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.id))
    .limit(limit);
}
