"use server";

import { revalidatePath } from "next/cache";
import {
  EXCEPTION_QUEUE_ROLES,
  assignExceptionOwner,
  resolveException,
} from "@/lib/exceptions";
import { reconcileTimedOutOpenCases } from "@/lib/reconcile";
import { getCurrentUser } from "@/lib/session";

export type ExceptionActionState = { ok: boolean; message: string };

async function requireQueueUser() {
  const user = await getCurrentUser();
  if (
    !user ||
    !user.active ||
    !EXCEPTION_QUEUE_ROLES.includes(
      user.role as (typeof EXCEPTION_QUEUE_ROLES)[number],
    )
  ) {
    throw new Error("Exception queue requires supply_chain or admin");
  }
  return user;
}

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function assignOwnerAction(
  _prev: ExceptionActionState,
  formData: FormData,
): Promise<ExceptionActionState> {
  try {
    const user = await requireQueueUser();
    const row = await assignExceptionOwner(
      {
        exceptionId: str(formData, "exceptionId"),
        ownerUserId: str(formData, "ownerUserId"),
      },
      user.id,
    );
    revalidatePath("/exceptions");
    revalidatePath("/settings/audit");
    return {
      ok: true,
      message: `Assigned owner on exception #${row.id}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Assign failed",
    };
  }
}

export async function resolveExceptionAction(
  _prev: ExceptionActionState,
  formData: FormData,
): Promise<ExceptionActionState> {
  try {
    const user = await requireQueueUser();
    const row = await resolveException(
      {
        exceptionId: str(formData, "exceptionId"),
        resolutionNote: str(formData, "resolutionNote"),
      },
      user.id,
    );
    revalidatePath("/exceptions");
    revalidatePath("/settings/audit");
    return {
      ok: true,
      message: `Resolved exception #${row.id}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Resolve failed",
    };
  }
}

export async function runTimeoutReconcileAction(): Promise<ExceptionActionState> {
  try {
    const user = await requireQueueUser();
    const result = await reconcileTimedOutOpenCases(user.id);
    const created = result.results.reduce(
      (n, r) => n + r.createdExceptionIds.length,
      0,
    );
    revalidatePath("/exceptions");
    return {
      ok: true,
      message: `Timeout check (${result.hours}h): ${result.results.length} stale case(s), ${created} new exception(s)`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Timeout reconcile failed",
    };
  }
}
