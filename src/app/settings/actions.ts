"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import {
  assertCanManageSettings,
  createExpiryRule,
  createProduct,
  createStorageLocation,
  createVendor,
  updateProduct,
  upsertProductAccess,
} from "@/lib/settings";

export type ActionState = {
  ok: boolean;
  message: string;
};

async function requireSettingsUser() {
  const user = await getCurrentUser();
  return assertCanManageSettings(user);
}

function formString(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function createVendorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSettingsUser();
    const row = await createVendor(
      {
        name: formString(formData, "name"),
        externalId: formString(formData, "externalId") || undefined,
      },
      user.id,
    );
    revalidatePath("/settings");
    revalidatePath("/settings/vendors");
    revalidatePath("/settings/audit");
    return { ok: true, message: `Vendor created: ${row.name}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to create vendor",
    };
  }
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSettingsUser();
    const row = await createProduct(
      {
        vendorId: formString(formData, "vendorId"),
        catalogNumber: formString(formData, "catalogNumber"),
        description: formString(formData, "description"),
        category: formString(formData, "category") || undefined,
        gtin: formString(formData, "gtin") || undefined,
        hibc: formString(formData, "hibc") || undefined,
        catalogIdentifier: formString(formData, "catalogIdentifier") || undefined,
      },
      user.id,
    );
    revalidatePath("/settings");
    revalidatePath("/settings/products");
    revalidatePath("/settings/product-access");
    revalidatePath("/settings/audit");
    return {
      ok: true,
      message: `Product created: ${row.catalogNumber} (id ${row.id})`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to create product",
    };
  }
}

export async function updateProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSettingsUser();
    const row = await updateProduct(
      {
        id: formString(formData, "id"),
        description: formString(formData, "description"),
        category: formString(formData, "category") || undefined,
      },
      user.id,
    );
    revalidatePath("/settings");
    revalidatePath("/settings/products");
    revalidatePath("/settings/audit");
    return {
      ok: true,
      message: `Product updated: ${row.catalogNumber} — ${row.description}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to update product",
    };
  }
}

export async function createLocationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSettingsUser();
    const row = await createStorageLocation(
      {
        name: formString(formData, "name"),
        departmentId: formString(formData, "departmentId") || undefined,
        storageType: formString(formData, "storageType") || undefined,
      },
      user.id,
    );
    revalidatePath("/settings");
    revalidatePath("/settings/locations");
    revalidatePath("/settings/audit");
    return { ok: true, message: `Location created: ${row.name}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to create location",
    };
  }
}

export async function upsertProductAccessAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSettingsUser();
    const data = await upsertProductAccess(
      {
        productId: formString(formData, "productId"),
        departmentId: formString(formData, "departmentId"),
        accessMode: formString(formData, "accessMode"),
        locationId: formString(formData, "locationId") || undefined,
        parLevel: formString(formData, "parLevel") || undefined,
      },
      user.id,
    );
    revalidatePath("/settings");
    revalidatePath("/settings/product-access");
    revalidatePath("/settings/products");
    revalidatePath("/settings/audit");
    return {
      ok: true,
      message: `Access saved for product ${data.productId}: ${data.accessMode}, par ${data.parLevel ?? "—"}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to save product access",
    };
  }
}

export async function createExpiryRuleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSettingsUser();
    const row = await createExpiryRule(
      {
        vendorId: formString(formData, "vendorId") || undefined,
        daysBefore: formString(formData, "daysBefore") || 60,
        vendorPaysExpired: formData.get("vendorPaysExpired") ? "1" : "0",
      },
      user.id,
    );
    revalidatePath("/settings");
    revalidatePath("/settings/expiry-rules");
    revalidatePath("/settings/audit");
    return {
      ok: true,
      message: `Expiry rule created (id ${row.id}, ${row.daysBefore} days)`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to create expiry rule",
    };
  }
}
