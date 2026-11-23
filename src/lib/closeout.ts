import { z } from "zod";
import { getDb, type AppDb } from "@/db";
import { stockEvents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCase, listCasePullLines } from "@/lib/cases";

export const closeoutActionSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  locationId: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, z.number().int().positive().nullable()),
  lot: z.string().trim().min(1),
  expiry: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  qty: z.coerce.number().int().positive().default(1),
  rawBarcode: z.string().trim().optional(),
});

async function assertOpenRemaining(
  data: z.infer<typeof closeoutActionSchema>,
  db: AppDb,
) {
  const c = await getCase(data.caseId, db);
  if (!c) throw new Error("Case not found");
  if (c.status !== "open") throw new Error("Case is not open");

  const lines = await listCasePullLines(data.caseId, db);
  const line = lines.find(
    (l) =>
      l.productId === data.productId &&
      (l.lot ?? null) === data.lot &&
      (l.expiry ?? null) === data.expiry &&
      (l.locationId ?? null) === (data.locationId ?? null),
  );
  if (!line) throw new Error("No matching pulled line for this case");
  if (line.remaining < data.qty) {
    throw new Error(
      `Only ${line.remaining} remaining to close out for this line (requested ${data.qty})`,
    );
  }
  return { caseRow: c, line };
}

/** Mark pulled item as returned — returned stock_event (stock back on hand). */
export async function closeoutReturned(
  input: unknown,
  userId: number,
  db: AppDb = getDb(),
) {
  const data = closeoutActionSchema.parse(input);
  await assertOpenRemaining(data, db);

  const [event] = await db
    .insert(stockEvents)
    .values({
      eventType: "returned",
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
      action: "returned",
      detail: `case=${data.caseId} product=${data.productId} lot=${data.lot} qty=${data.qty}`,
    },
    db,
  );
  return event;
}
