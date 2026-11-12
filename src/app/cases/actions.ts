"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  abortCase,
  closeCase,
  CASE_ROLES,
  openCase,
} from "@/lib/cases";
import { openOrResumeCase } from "@/lib/case-open";
import { closeoutReturned } from "@/lib/closeout";
import { lookupForPull, recordPull } from "@/lib/pull";
import { getCurrentUser } from "@/lib/session";

export type CaseActionState = {
  ok: boolean;
  message: string;
  resumeCaseId?: number;
};

async function requireCaseUser() {
  const user = await getCurrentUser();
  if (
    !user ||
    !user.active ||
    !CASE_ROLES.includes(user.role as (typeof CASE_ROLES)[number])
  ) {
    throw new Error("Cases require tech, supply_chain, or admin");
  }
  return user;
}

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function openCaseAction(
  _prev: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  try {
    const user = await requireCaseUser();
    const input = {
      departmentId: str(formData, "departmentId"),
      roomId: str(formData, "roomId") || undefined,
      procedureTypeId: str(formData, "procedureTypeId") || undefined,
    };
    let caseId: number;
    if (input.roomId) {
      const { resumed, caseRow } = await openOrResumeCase(input, user.id);
      if (resumed) {
        return {
          ok: false,
          message: `A case is already open in ${caseRow.roomName}`,
          resumeCaseId: caseRow.id,
        };
      }
      caseId = caseRow.id;
    } else {
      caseId = (await openCase(input, user.id)).id;
    }
    revalidatePath("/cases");
    redirect(`/cases/${caseId}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // next redirect
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to open case",
    };
  }
}

export async function abortCaseAction(caseId: number): Promise<CaseActionState> {
  try {
    const user = await requireCaseUser();
    await abortCase(caseId, user.id);
    revalidatePath("/cases");
    revalidatePath(`/cases/${caseId}`);
    revalidatePath("/");
    return { ok: true, message: `Case ${caseId} aborted` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to abort case",
    };
  }
}

export async function closeCaseAction(caseId: number): Promise<CaseActionState> {
  try {
    const user = await requireCaseUser();
    await closeCase(caseId, user.id);
    revalidatePath("/cases");
    revalidatePath(`/cases/${caseId}`);
    revalidatePath("/");
    return { ok: true, message: `Case ${caseId} closed` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to close case",
    };
  }
}

export async function lookupPullBarcodeAction(rawBarcode: string) {
  await requireCaseUser();
  return lookupForPull(rawBarcode);
}

export async function recordPullAction(
  _prev: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  try {
    const user = await requireCaseUser();
    const event = await recordPull(
      {
        caseId: str(formData, "caseId"),
        rawBarcode: str(formData, "rawBarcode"),
        productId: str(formData, "productId"),
        locationId: str(formData, "locationId") || null,
        lot: str(formData, "lot"),
        expiry: str(formData, "expiry"),
        qty: str(formData, "qty") || "1",
        barcodeFormat: str(formData, "barcodeFormat") || undefined,
        lotExpirySource: str(formData, "lotExpirySource") || "manual",
      },
      user.id,
    );
    const caseId = Number(str(formData, "caseId"));
    revalidatePath(`/cases/${caseId}`);
    revalidatePath("/");
    return {
      ok: true,
      message: `Pulled event #${event.id} recorded (qty ${event.qty})`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to record pull",
    };
  }
}

export async function closeoutAction(
  _prev: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  try {
    const user = await requireCaseUser();
    const disposition = str(formData, "disposition");
    const payload = {
      caseId: str(formData, "caseId"),
      productId: str(formData, "productId"),
      locationId: str(formData, "locationId") || null,
      lot: str(formData, "lot"),
      expiry: str(formData, "expiry"),
      qty: str(formData, "qty") || "1",
      rawBarcode: str(formData, "rawBarcode") || undefined,
      disposition,
    };

    if (disposition !== "returned") {
      throw new Error("Only return is part of this workflow");
    }
    await closeoutReturned(payload, user.id);

    const caseId = Number(payload.caseId);
    revalidatePath(`/cases/${caseId}`);
    revalidatePath("/");
    return { ok: true, message: `Marked ${disposition}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Close-out failed",
    };
  }
}
