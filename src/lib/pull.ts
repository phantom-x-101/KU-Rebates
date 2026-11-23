import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import { stockEvents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCase } from "@/lib/cases";
import { identifyProduct } from "@/lib/arrival";
import { isLotExpiryOnly } from "@/lib/barcode";
import { flagNotOnAnyContract, recordUnmappedBarcode } from "@/lib/exceptions";
import { listPullableLots, type PullableLot } from "@/lib/stock";

export const recordPullSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  rawBarcode: z.string().trim().min(1),
  productId: z.coerce.number().int().positive(),
  locationId: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, z.number().int().positive().nullable()),
  lot: z.string().trim().min(1, "Lot is required"),
  expiry: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry must be YYYY-MM-DD"),
  qty: z.coerce.number().int().positive().default(1),
  barcodeFormat: z.enum(["gs1", "hibc", "other"]).optional(),
  lotExpirySource: z.enum(["barcode", "manual"]).default("manual"),
});

/**
 * Record a pulled stock event for an open case.
 * Location may be null for brought-in items.
 */
export async function recordPull(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = recordPullSchema.parse(input);
  const c = await getCase(data.caseId, db);
  if (!c) throw new Error("Case not found");
  if (c.status !== "open") throw new Error("Case is not open");

  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "pulled",
      productId: data.productId,
      locationId: data.locationId,
      caseId: data.caseId,
      lot: data.lot,
      expiry: data.expiry,
      qty: data.qty,
      byUserId: userId,
    })
    .returning();

  await audit(
    {
      userId,
      container: 1,
      entity: "stock_events",
      entityId: event.id,
      action: "pulled",
      detail: `case=${data.caseId} product=${data.productId} lot=${data.lot} loc=${data.locationId ?? "brought_in"} qty=${data.qty}`,
    },
    db,
  );
  await flagNotOnAnyContract(data.productId, "pull", userId, db);

  return event;
}

/**
 * Identify a pull scan. When the barcode has no lot or expiry (HIBC), `lots`
 * lists what is on hand for the product, earliest expiry first.
 */
export async function lookupForPull(
  rawBarcode: string,
  userId: number | null,
  db: AppDb = getDb(),
) {
  const { parsed, product } = await identifyProduct(rawBarcode, db);
  if (!product) {
    if (!isLotExpiryOnly(parsed)) {
      await recordUnmappedBarcode(rawBarcode, "pull", userId, db);
    }
    return { parsed, product, lots: [] as PullableLot[] };
  }
  const lots =
    parsed.lot && parsed.expiry
      ? []
      : await listPullableLots(product.productId, new Date(), db);
  return { parsed, product, lots };
}
