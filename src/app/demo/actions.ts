"use server";

import { revalidatePath } from "next/cache";
import { resetDemoData } from "@/lib/demo-reset";
import { getCurrentUser } from "@/lib/session";

export async function resetDemoAction() {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    throw new Error("Pick a user before resetting the demo");
  }
  await resetDemoData(user.id);
  revalidatePath("/", "layout");
}
