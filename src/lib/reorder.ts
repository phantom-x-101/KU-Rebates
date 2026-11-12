import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db";
import {
  departments,
  productAccess,
  products,
  vendors,
  type User,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { stockOnHand } from "@/lib/stock";

export type ReorderRow = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorId: number;
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
      vendorId: products.vendorId,
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
      suggestion = `Low stock — consider requisition of ${need} (par ${par}, on hand ${onHand}). Pycube does not place the order.`;
    }

    return {
      productId: a.productId,
      catalogNumber: a.catalogNumber,
      description: a.description,
      vendorId: a.vendorId,
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

/**
 * Records a reorder suggestion. This prototype does not place the order.
 * A vendor rep can only note products for their own vendor.
 */
export async function noteReorderSuggestion(
  user: User,
  productId: number,
  db: AppDb = getDb(),
) {
  const rows = (await listReorderView(db)).filter(
    (row) => row.productId === productId && row.lowStock,
  );
  const own =
    user.role === "vendor_rep"
      ? rows.filter((row) => row.vendorId === user.vendorId)
      : rows;
  if (user.role === "tech") {
    throw new Error("Tech cannot note a reorder");
  }
  if (user.role === "vendor_rep" && user.vendorId == null) {
    throw new Error("Vendor rep must be linked to a vendor");
  }
  if (own.length === 0) {
    throw new Error("This item is not below par");
  }
  const need = own.reduce(
    (sum, row) => sum + Math.max(0, (row.parLevel ?? 0) - row.onHand),
    0,
  );
  const first = own[0];
  await audit(
    {
      userId: user.id,
      container: 1,
      entity: "product",
      entityId: productId,
      action: "reorder_suggested",
      detail: `catalog=${first.catalogNumber} need=${need} par=${first.parLevel} on_hand=${first.onHand}.`,
    },
    db,
  );
  return {
    message: `Suggestion noted for ${need}.`,
  };
}
