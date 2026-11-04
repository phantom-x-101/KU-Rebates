"use server";

import { revalidatePath } from "next/cache";
import {
  disposeExpiredLot,
  ensureExpiredOnShelfExceptions,
} from "@/lib/stock-view";
import { getCurrentUser } from "@/lib/session";
import { canManageSettings } from "@/lib/settings";

export type StockActionState = { ok: boolean; message: string };

async function requireSupplyUser() {
  const user = await getCurrentUser();
  if (!canManageSettings(user)) {
    throw new Error("Stock disposal requires supply_chain or admin");
  }
  return user!;
}

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function disposeExpiredAction(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const user = await requireSupplyUser();
    const locationRaw = str(formData, "locationId");
    const event = await disposeExpiredLot(
      {
        productId: Number(str(formData, "productId")),
        locationId: locationRaw === "" ? null : Number(locationRaw),
        lot: str(formData, "lot") || null,
        expiry: str(formData, "expiry") || null,
      },
      user.id,
    );
    revalidatePath("/stock");
    revalidatePath("/reorder");
    revalidatePath("/");
    revalidatePath("/exceptions");
    return {
      ok: true,
      message: `Disposed expired lot (event #${event.id}, qty ${event.qty})`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Dispose failed",
    };
  }
}

export async function scanExpiredOnShelfAction(): Promise<StockActionState> {
  try {
    const user = await requireSupplyUser();
    const result = await ensureExpiredOnShelfExceptions(user.id);
    revalidatePath("/exceptions");
    revalidatePath("/stock");
    return {
      ok: true,
      message: `Expired lots: ${result.expiredLots}; new exceptions: ${result.createdExceptionIds.length}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Scan failed",
    };
  }
}
