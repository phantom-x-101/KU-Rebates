"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import {
  checkInUnit,
  identifyCheckInProduct,
  unlinkUnit,
  type CheckInIdentifyResult,
  type CheckInResult,
  type UnlinkResult,
} from "@/lib/units";

function revalidateCheckIn() {
  revalidatePath("/vendor/check-in");
  revalidatePath("/vendor/stock");
  revalidatePath("/vendor");
  revalidatePath("/station");
  revalidatePath("/stock");
  revalidatePath("/exceptions");
  revalidatePath("/");
}

async function requireVendorRep() {
  const user = await getCurrentUser();
  if (!user || !user.active || user.role !== "vendor_rep" || user.vendorId == null) {
    throw new Error("Check-in is limited to the signed-in vendor rep");
  }
  return user;
}

export async function identifyCheckInAction(input: {
  raw: string;
  pendingRaw?: string | null;
  lot?: string;
  expiry?: string;
}): Promise<CheckInIdentifyResult> {
  const user = await requireVendorRep();
  const result = await identifyCheckInProduct(
    {
      raw: input.raw,
      pendingRaw: input.pendingRaw,
      lot: input.lot,
      expiry: input.expiry,
    },
    user.id,
  );
  if (result.status === "error" || result.status === "unknown") {
    revalidatePath("/exceptions");
  }
  return result;
}

export async function checkInTagAction(input: {
  tagRaw: string;
  productId: number;
  lot: string;
  expiry: string;
}): Promise<CheckInResult> {
  const user = await requireVendorRep();
  const result = await checkInUnit(
    {
      tagRaw: input.tagRaw,
      productId: input.productId,
      lot: input.lot,
      expiry: input.expiry,
    },
    user.id,
  );
  revalidateCheckIn();
  return result;
}

export async function unlinkUnitAction(unitId: number): Promise<UnlinkResult> {
  const user = await requireVendorRep();
  const result = await unlinkUnit(unitId, user.id);
  revalidateCheckIn();
  return result;
}
