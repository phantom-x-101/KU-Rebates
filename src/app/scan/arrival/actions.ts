"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { identifyProduct, recordArrival } from "@/lib/arrival";
import type { UserRole } from "@/db/schema";

export type ArrivalActionState = {
  ok: boolean;
  message: string;
  eventId?: number;
};

const SCAN_ROLES: UserRole[] = ["tech", "supply_chain", "admin"];

async function requireScanUser() {
  const user = await getCurrentUser();
  if (!user || !user.active || !SCAN_ROLES.includes(user.role as UserRole)) {
    throw new Error("Scan on arrival requires tech, supply_chain, or admin");
  }
  return user;
}

export async function lookupBarcodeAction(rawBarcode: string) {
  await requireScanUser();
  return identifyProduct(rawBarcode);
}

export async function recordArrivalAction(
  _prev: ArrivalActionState,
  formData: FormData,
): Promise<ArrivalActionState> {
  try {
    const user = await requireScanUser();
    const get = (k: string) => {
      const v = formData.get(k);
      return typeof v === "string" ? v : "";
    };

    const event = await recordArrival(
      {
        rawBarcode: get("rawBarcode"),
        productId: get("productId"),
        locationId: get("locationId"),
        lot: get("lot"),
        expiry: get("expiry"),
        qty: get("qty") || "1",
        barcodeFormat: get("barcodeFormat") || undefined,
        lotExpirySource: get("lotExpirySource") || "manual",
      },
      user.id,
    );

    revalidatePath("/");
    revalidatePath("/scan/arrival");
    return {
      ok: true,
      message: `Recorded arrival event #${event.id} (lot ${event.lot}, expiry ${event.expiry})`,
      eventId: event.id,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to record arrival",
    };
  }
}
