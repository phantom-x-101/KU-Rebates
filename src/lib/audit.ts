import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import type { AppDb } from "@/db";

export type AuditInput = {
  userId?: number | null;
  container?: 1 | 2 | 3 | null;
  entity: string;
  entityId?: number | null;
  action: string;
  detail?: string | null;
};

/** Every state-changing write must call audit(). */
export async function audit(input: AuditInput, db: AppDb = getDb()) {
  const [row] = await db
    .insert(auditLog)
    .values({
      userId: input.userId ?? null,
      container: input.container ?? null,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      detail: input.detail ?? null,
    })
    .returning({ id: auditLog.id });
  return row;
}
