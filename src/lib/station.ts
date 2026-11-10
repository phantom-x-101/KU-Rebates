import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { getDb, type AppDb } from "@/db";
import {
  departments,
  procedureTypes,
  productAccess,
  rooms,
  storageLocations,
  vendors,
} from "@/db/schema";
import { identifyProduct, recordArrival } from "@/lib/arrival";
import { CARDIVA_HIBC_SAMPLE, type ParsedBarcode } from "@/lib/barcode";
import { getCase, listCasePullLines, openCase } from "@/lib/cases";
import {
  closeoutReturned,
  closeoutUsed,
  closeoutWasted,
} from "@/lib/closeout";
import { recordPull } from "@/lib/pull";
import { reconcileCase, type CaseReconciliation } from "@/lib/reconcile";
import { createProduct } from "@/lib/settings/products";
import { upsertProductAccess } from "@/lib/settings/product-access";
import { stockOnHand } from "@/lib/stock";
import { listStockView, type StockViewRow } from "@/lib/stock-view";

export type StationMode = "arrive" | "pull" | "use" | "waste" | "return";

export type StationItem = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorName: string;
  lot: string | null;
  expiry: string | null;
  qty: number;
};

export type StationSuccess = {
  ok: true;
  status: "success";
  headline: string;
  mode: StationMode;
  item: StationItem;
};

export type StationNeedsLot = {
  ok: false;
  status: "needs_lot";
  message: string;
  raw: string;
  product: {
    productId: number;
    catalogNumber: string;
    description: string;
    vendorName: string;
  };
  suggestedLot: string;
  suggestedExpiry: string;
};

export type StationUnknown = {
  ok: false;
  status: "unknown";
  message: string;
  raw: string;
};

export type StationErrorCode =
  | "expired"
  | "not_pulled"
  | "duplicate"
  | "no_case"
  | "not_on_shelf"
  | "other";

export type StationError = {
  ok: false;
  status: "error";
  code: StationErrorCode;
  message: string;
  item: StationItem | null;
};

export type StationOutcome =
  | StationSuccess
  | StationNeedsLot
  | StationUnknown
  | StationError;

const HEADLINES: Record<StationMode, string> = {
  arrive: "Added to shelf",
  pull: "Pulled for case",
  use: "Marked used",
  waste: "Marked wasted",
  return: "Returned to shelf",
};

const LOT_HINTS: Record<string, { lot: string; expiry: string }> = {
  [CARDIVA_HIBC_SAMPLE]: { lot: "G612C260420B", expiry: "2028-04-09" },
  "800-612C": { lot: "G612C260420B", expiry: "2028-04-09" },
  "VC-ABL-01": { lot: "VCABL1001", expiry: "2027-06-01" },
  "VC-MAP-01": { lot: "VCMAP2001", expiry: "2027-08-15" },
};

export function isPastExpiry(expiry: string, today: Date = new Date()) {
  const day = today.toISOString().slice(0, 10);
  return expiry < day;
}

function cleanRaw(raw: string) {
  return raw.replace(/\u0000/g, "").replace(/\r/g, "").trim();
}

function errorText(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }
  if (error instanceof Error) return error.message;
  return "Scan failed";
}

function itemFrom(
  product: {
    productId: number;
    catalogNumber: string;
    description: string;
    vendorName: string;
  },
  lot: string | null,
  expiry: string | null,
  qty = 1,
): StationItem {
  return {
    productId: product.productId,
    catalogNumber: product.catalogNumber,
    description: product.description,
    vendorName: product.vendorName,
    lot,
    expiry,
    qty,
  };
}

async function shelfLocationId(productId: number, db: AppDb) {
  const [access] = await db
    .select()
    .from(productAccess)
    .where(eq(productAccess.productId, productId))
    .limit(1);
  if (access?.locationId) return access.locationId;
  const [shelf] = await db
    .select()
    .from(storageLocations)
    .where(eq(storageLocations.name, "EP shelf"))
    .limit(1);
  if (shelf) return shelf.id;
  const [anyLoc] = await db.select().from(storageLocations).limit(1);
  if (!anyLoc) throw new Error("No storage location is set up");
  return anyLoc.id;
}

function lotHint(raw: string, parsed: ParsedBarcode, catalogNumber: string) {
  return (
    LOT_HINTS[raw] ??
    LOT_HINTS[parsed.item ?? ""] ??
    LOT_HINTS[catalogNumber] ?? { lot: "", expiry: "" }
  );
}

export async function openStationCase(userId: number, db: AppDb = getDb()) {
  const [dept] = await db
    .select()
    .from(departments)
    .where(eq(departments.name, "EP lab"))
    .limit(1);
  if (!dept) throw new Error("EP lab is not set up");
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.departmentId, dept.id))
    .limit(1);
  const [proc] = await db
    .select()
    .from(procedureTypes)
    .where(eq(procedureTypes.departmentId, dept.id))
    .limit(1);
  return openCase(
    {
      departmentId: dept.id,
      roomId: room?.id,
      procedureTypeId: proc?.id,
    },
    userId,
    db,
  );
}

export async function closeStationCase(
  caseId: number,
  userId: number,
  db: AppDb = getDb(),
) {
  const { closeCase } = await import("@/lib/cases");
  await closeCase(caseId, userId, db);
  return reconcileCase(caseId, db);
}

export async function applyStationScan(
  input: {
    mode: StationMode;
    rawBarcode: string;
    caseId?: number | null;
    lot?: string | null;
    expiry?: string | null;
  },
  userId: number,
  db: AppDb = getDb(),
): Promise<StationOutcome> {
  const raw = cleanRaw(input.rawBarcode);
  if (!raw) {
    return {
      ok: false,
      status: "error",
      code: "other",
      message: "Empty scan",
      item: null,
    };
  }

  const { parsed, product } = await identifyProduct(raw, db);
  if (!product) {
    return {
      ok: false,
      status: "unknown",
      message: "Unknown barcode",
      raw,
    };
  }

  const lot = (input.lot?.trim() || parsed.lot || "").trim();
  const expiry = (input.expiry?.trim() || parsed.expiry || "").trim();
  if (!lot || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    const hint = lotHint(raw, parsed, product.catalogNumber);
    return {
      ok: false,
      status: "needs_lot",
      message:
        parsed.format === "hibc"
          ? "HIBC carries the item only. Enter lot and expiry."
          : "Lot and expiry are not in this barcode. Enter them.",
      raw,
      product: {
        productId: product.productId,
        catalogNumber: product.catalogNumber,
        description: product.description,
        vendorName: product.vendorName,
      },
      suggestedLot: lot || hint.lot,
      suggestedExpiry: /^\d{4}-\d{2}-\d{2}$/.test(expiry)
        ? expiry
        : hint.expiry,
    };
  }

  const knownItem = itemFrom(product, lot, expiry, 1);
  if (isPastExpiry(expiry)) {
    return {
      ok: false,
      status: "error",
      code: "expired",
      message: `Expired item — not accepted (expiry ${expiry})`,
      item: knownItem,
    };
  }

  const caseId = input.caseId ?? null;
  if (input.mode !== "arrive") {
    if (!caseId) {
      return {
        ok: false,
        status: "error",
        code: "no_case",
        message: "Open an EP case first",
        item: knownItem,
      };
    }
    const caseRow = await getCase(caseId, db);
    if (!caseRow) {
      return {
        ok: false,
        status: "error",
        code: "no_case",
        message: "Case not found",
        item: knownItem,
      };
    }
    if (caseRow.status !== "open") {
      return {
        ok: false,
        status: "error",
        code: "no_case",
        message: "Case is not open",
        item: knownItem,
      };
    }
  }

  const lotSource = parsed.lot && parsed.expiry ? "barcode" : "manual";

  try {
    if (input.mode === "arrive") {
      const locationId = await shelfLocationId(product.productId, db);
      await recordArrival(
        {
          rawBarcode: raw,
          productId: product.productId,
          locationId,
          lot,
          expiry,
          qty: 1,
          barcodeFormat: parsed.format,
          lotExpirySource: lotSource,
        },
        userId,
        db,
      );
    } else if (input.mode === "pull") {
      const onHand = await stockOnHand({ productId: product.productId }, db);
      const shelf = onHand.find(
        (row) =>
          (row.lot ?? null) === lot &&
          (row.expiry ?? null) === expiry &&
          row.onHand > 0,
      );
      if (!shelf) {
        const lines = await listCasePullLines(caseId!, db);
        const already = lines.find(
          (line) =>
            line.productId === product.productId &&
            (line.lot ?? null) === lot &&
            (line.expiry ?? null) === expiry &&
            line.pulled > 0,
        );
        if (already) {
          return {
            ok: false,
            status: "error",
            code: "duplicate",
            message: "Duplicate — this lot is already pulled and the shelf is empty",
            item: knownItem,
          };
        }
        return {
          ok: false,
          status: "error",
          code: "not_on_shelf",
          message: "Nothing on the shelf for this lot. Arrive it first.",
          item: knownItem,
        };
      }
      await recordPull(
        {
          caseId,
          rawBarcode: raw,
          productId: product.productId,
          locationId: shelf.locationId,
          lot,
          expiry,
          qty: 1,
          barcodeFormat: parsed.format,
          lotExpirySource: lotSource,
        },
        userId,
        db,
      );
    } else {
      const lines = await listCasePullLines(caseId!, db);
      const line = lines.find(
        (entry) =>
          entry.productId === product.productId &&
          (entry.lot ?? null) === lot &&
          (entry.expiry ?? null) === expiry &&
          entry.remaining > 0,
      );
      if (!line) {
        const closed = lines.find(
          (entry) =>
            entry.productId === product.productId &&
            (entry.lot ?? null) === lot &&
            (entry.expiry ?? null) === expiry &&
            entry.pulled > 0 &&
            entry.remaining <= 0,
        );
        return {
          ok: false,
          status: "error",
          code: closed ? "duplicate" : "not_pulled",
          message: closed
            ? "Duplicate — this item is already closed out for this case"
            : "Item not pulled for this case",
          item: knownItem,
        };
      }
      const payload = {
        caseId,
        productId: product.productId,
        locationId: line.locationId,
        lot,
        expiry,
        qty: 1,
        rawBarcode: raw,
      };
      if (input.mode === "use") await closeoutUsed(payload, userId, db);
      else if (input.mode === "waste") await closeoutWasted(payload, userId, db);
      else await closeoutReturned(payload, userId, db);
    }
  } catch (error) {
    const message = errorText(error);
    if (/no matching pulled/i.test(message)) {
      return {
        ok: false,
        status: "error",
        code: "not_pulled",
        message: "Item not pulled for this case",
        item: knownItem,
      };
    }
    if (/remaining/i.test(message)) {
      return {
        ok: false,
        status: "error",
        code: "duplicate",
        message: "Duplicate — this item is already closed out for this case",
        item: knownItem,
      };
    }
    return {
      ok: false,
      status: "error",
      code: "other",
      message,
      item: knownItem,
    };
  }

  return {
    ok: true,
    status: "success",
    headline: HEADLINES[input.mode],
    mode: input.mode,
    item: knownItem,
  };
}

export async function addStationProduct(
  input: {
    vendorId: number;
    description: string;
    catalogNumber: string;
    parLevel: number;
    rawBarcode: string;
    mode: StationMode;
    caseId?: number | null;
    lot?: string | null;
    expiry?: string | null;
  },
  userId: number,
  db: AppDb = getDb(),
): Promise<StationOutcome> {
  const raw = cleanRaw(input.rawBarcode);
  const { parsed } = await identifyProduct(raw, db);
  const product = await createProduct(
    {
      vendorId: input.vendorId,
      catalogNumber: input.catalogNumber.trim(),
      description: input.description.trim(),
      gtin: parsed.format === "gs1" ? (parsed.gtin ?? undefined) : undefined,
      hibc: parsed.format === "hibc" ? (parsed.item ?? raw) : undefined,
      catalogIdentifier:
        parsed.format === "gs1" || parsed.format === "hibc"
          ? input.catalogNumber.trim()
          : raw,
    },
    userId,
    db,
  );

  const [dept] = await db
    .select()
    .from(departments)
    .where(eq(departments.name, "EP lab"))
    .limit(1);
  const locationId = await shelfLocationId(product.id, db);
  if (dept) {
    await upsertProductAccess(
      {
        productId: product.id,
        departmentId: dept.id,
        accessMode: "on_shelf",
        locationId,
        parLevel: input.parLevel,
      },
      userId,
      db,
    );
  }

  return applyStationScan(
    {
      mode: input.mode,
      rawBarcode: raw,
      caseId: input.caseId,
      lot: input.lot,
      expiry: input.expiry,
    },
    userId,
    db,
  );
}

export async function loadStationBoard(
  caseId: number | null,
  db: AppDb = getDb(),
) {
  const [stock, vendorRows, caseRow] = await Promise.all([
    listStockView({}, new Date(), db),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(vendors.name),
    caseId ? getCase(caseId, db) : Promise.resolve(null),
  ]);

  let reconciliation: CaseReconciliation | null = null;
  let lines: Awaited<ReturnType<typeof listCasePullLines>> = [];
  if (caseRow) {
    [reconciliation, lines] = await Promise.all([
      reconcileCase(caseRow.id, db),
      listCasePullLines(caseRow.id, db),
    ]);
  }

  return {
    stock: stock satisfies StockViewRow[],
    vendors: vendorRows,
    caseRow,
    reconciliation,
    lines,
  };
}
