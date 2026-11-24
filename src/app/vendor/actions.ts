"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import {
  requireVendorRepScope,
} from "@/lib/vendor-portal";
import {
  updateVendorExpiryDays,
  updateVendorParLevel,
} from "@/lib/vendor-settings";

function refresh() {
  revalidatePath("/vendor");
  revalidatePath("/vendor/stock");
  revalidatePath("/exceptions");
}

export async function updateParAction(formData: FormData) {
  const user = await getCurrentUser();
  const { vendorId } = requireVendorRepScope(user);
  await updateVendorParLevel(
    {
      productId: formData.get("productId"),
      parLevel: formData.get("parLevel"),
    },
    vendorId,
    user!.id,
  );
  refresh();
}

export async function updateExpiryDaysAction(formData: FormData) {
  const user = await getCurrentUser();
  const { vendorId } = requireVendorRepScope(user);
  await updateVendorExpiryDays(
    { daysBefore: formData.get("daysBefore") },
    vendorId,
    user!.id,
  );
  refresh();
}
