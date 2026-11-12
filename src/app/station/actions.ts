"use server";

import { revalidatePath } from "next/cache";
import { openOrResumeCase } from "@/lib/case-open";
import { CASE_ROLES } from "@/lib/cases";
import { getCurrentUser } from "@/lib/session";
import {
  addStationProduct,
  applyStationScan,
  closeStationCase,
  type StationMode,
  type StationOutcome,
} from "@/lib/station";
import type { CaseReconciliation } from "@/lib/reconcile";

function revalidateDemo() {
  revalidatePath("/station");
  revalidatePath("/stock");
  revalidatePath("/exceptions");
  revalidatePath("/reorder");
  revalidatePath("/vendor");
  revalidatePath("/");
}

async function requireStationUser() {
  const user = await getCurrentUser();
  if (
    !user ||
    !user.active ||
    !CASE_ROLES.includes(user.role as (typeof CASE_ROLES)[number])
  ) {
    throw new Error("Scan station requires tech, supply_chain, or admin");
  }
  return user;
}

export async function scanAction(input: {
  mode: StationMode;
  rawBarcode: string;
  caseId: number | null;
  lot?: string;
  expiry?: string;
}): Promise<StationOutcome> {
  const user = await requireStationUser();
  const result = await applyStationScan(
    {
      mode: input.mode,
      rawBarcode: input.rawBarcode,
      caseId: input.caseId,
      lot: input.lot,
      expiry: input.expiry,
    },
    user.id,
  );
  revalidateDemo();
  return result;
}

export type OpenCaseResult =
  | { status: "opened"; id: number }
  | { status: "exists"; id: number; message: string }
  | { status: "error"; message: string };

export async function openStationCaseAction(input: {
  departmentId: number;
  roomId: number;
  procedureTypeId: number | null;
}): Promise<OpenCaseResult> {
  try {
    const user = await requireStationUser();
    const { resumed, caseRow } = await openOrResumeCase(input, user.id);
    if (resumed) {
      return {
        status: "exists",
        id: caseRow.id,
        message: `A case is already open in ${caseRow.roomName}`,
      };
    }
    revalidateDemo();
    revalidatePath("/cases");
    return { status: "opened", id: caseRow.id };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not open the case",
    };
  }
}

export async function closeEpCaseAction(caseId: number): Promise<{
  closed: boolean;
  balanced: boolean;
  message: string;
  reconciliation: CaseReconciliation | null;
}> {
  try {
    const user = await requireStationUser();
    const reconciliation = await closeStationCase(caseId, user.id);
    revalidateDemo();
    return {
      closed: true,
      balanced: reconciliation.balanced,
      message: reconciliation.balanced
        ? "Check passed. Case closed."
        : `Gap of ${reconciliation.gap}. Taken ${reconciliation.taken}, returned ${reconciliation.returned}. Exception recorded.`,
      reconciliation,
    };
  } catch (error) {
    return {
      closed: false,
      balanced: false,
      message: error instanceof Error ? error.message : "Could not close the case",
      reconciliation: null,
    };
  }
}

export async function addProductAction(input: {
  vendorId: number;
  description: string;
  catalogNumber: string;
  parLevel: number;
  rawBarcode: string;
  mode: StationMode;
  caseId: number | null;
  lot?: string;
  expiry?: string;
}): Promise<StationOutcome> {
  try {
    const user = await requireStationUser();
    const result = await addStationProduct(
      {
        ...input,
        parLevel: Number(input.parLevel),
      },
      user.id,
    );
    revalidateDemo();
    return result;
  } catch (error) {
    return {
      ok: false,
      status: "error",
      code: "other",
      message: error instanceof Error ? error.message : "Could not add the product",
      item: null,
    };
  }
}
