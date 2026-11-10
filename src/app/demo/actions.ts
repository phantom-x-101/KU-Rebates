"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resetDemoData } from "@/lib/demo-reset";
import { getCurrentUser } from "@/lib/session";

export async function resetDemoAction() {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    throw new Error("Pick a user before resetting the demo");
  }
  const started = Date.now();
  await resetDemoData(user.id);
  revalidatePath("/", "layout");
  const ms = Date.now() - started;
  redirect(`/demo?reset=${ms}`);
}
