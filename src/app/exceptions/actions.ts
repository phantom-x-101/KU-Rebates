"use server";

import { revalidatePath } from "next/cache";
import {
  assertCanAccessExceptionQueue,
  assignExceptionOwner,
  resolveException,
} from "@/lib/exceptions";
import { getCurrentUser } from "@/lib/session";

export type ExceptionActionState = { ok: boolean; message: string };

async function requireQueueUser() {
  const user = await getCurrentUser();
  assertCanAccessExceptionQueue(user);
  return user!;
}

async function requireWritableQueueUser() {
  const user = await requireQueueUser();
  if (user.role === "vendor_rep") {
    throw new Error("Vendors can view their queue but cannot assign or resolve it");
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
    const user = await requireWritableQueueUser();
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
    const user = await requireWritableQueueUser();
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
