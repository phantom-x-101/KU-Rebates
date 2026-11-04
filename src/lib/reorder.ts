import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  departments,
  productAccess,
  products,
  vendors,
} from "@/db/schema";
import { stockOnHand } from "@/lib/stock";

export type ReorderRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorName: string;
  departmentId: number;
  departmentName: string;
  accessMode: string;
  locationId: number | null;
  parLevel: number | null;
  onHand: number;
  lowStock: boolean;
  suggestion: string;
};

/**
 * Par level vs on-hand. Suggestions only — never places an order.
 */
export async function listReorderView(db: AppDb = getDb()): Promise<ReorderRow[]> {
  const access = await db
    .select({
      productId: productAccess.productId,
      departmentId: productAccess.departmentId,
      accessMode: productAccess.accessMode,
      locationId: productAccess.locationId,
      parLevel: productAccess.parLevel,
      catalogNumber: products.catalogNumber,
      description: products.description,
      vendorName: vendors.name,
      departmentName: departments.name,
    })
    .from(productAccess)
    .innerJoin(products, eq(productAccess.productId, products.id))
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .innerJoin(departments, eq(productAccess.departmentId, departments.id));

  const onHandRows = await stockOnHand({}, db);

  function onHandFor(productId: number, locationId: number | null): number {
    return onHandRows
      .filter(
        (r) =>
          r.productId === productId &&
          (locationId == null || r.locationId === locationId),
      )
      .reduce((s, r) => s + r.onHand, 0);
  }

  return access.map((a) => {
    const onHand = onHandFor(a.productId, a.locationId ?? null);
    const par = a.parLevel;
    const lowStock = par != null && onHand < par;
    let suggestion = "OK — at or above par";
    if (par == null) {
      suggestion = "No par level set — suggestion unavailable";
    } else if (lowStock) {
      const need = par - onHand;
      suggestion = `Low stock — consider requisition of ${need} (par ${par}, on hand ${onHand}). KU places the order; Pycube does not.`;
    }

    return {
      productId: a.productId,
      catalogNumber: a.catalogNumber,
      description: a.description,
      vendorName: a.vendorName,
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      accessMode: a.accessMode,
      locationId: a.locationId,
      parLevel: a.parLevel,
      onHand,
      lowStock,
      suggestion,
    };
  });
}
