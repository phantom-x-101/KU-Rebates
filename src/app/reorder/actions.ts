"use server";

import { revalidatePath } from "next/cache";
import { noteReorderSuggestion } from "@/lib/reorder";
import { getCurrentUser } from "@/lib/session";

export type ReorderActionState = { ok: boolean; message: string };

export async function noteReorderAction(
  _prev: ReorderActionState,
  formData: FormData,
): Promise<ReorderActionState> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.active) {
      return { ok: false, message: "Pick a user first." };
    }
    const productId = Number(formData.get("productId"));
    const result = await noteReorderSuggestion(user, productId);
    revalidatePath("/stock");
    revalidatePath("/reorder");
    revalidatePath("/vendor/stock");
    return { ok: true, message: result.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not note the suggestion";
    return { ok: false, message };
  }
}
