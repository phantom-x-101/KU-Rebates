import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { getDb, type AppDb } from "@/db";
import {
  departments,
  procedureTypes,
  productAccess,
  rooms,
  storageLocations,
  users,
  vendors,
} from "@/db/schema";
import { identifyProduct, recordArrival } from "@/lib/arrival";
import {
  describeScan,
  isLotExpiryOnly,
  pairLotScan,
  parseBarcode,
  type ParsedBarcode,
} from "@/lib/barcode";
import { getCase, listCasePullLines, openCase } from "@/lib/cases";
import { closeoutReturned } from "@/lib/closeout";
import {
  productOnAnyContract,
  recordRejectedArrival,
  recordUnknownTag,
  recordUnmappedBarcode,
  resolveUnmappedBarcode,
} from "@/lib/exceptions";
import { COMMERCIAL_VENDOR_IDS } from "@/lib/real-products";
import { recordPull } from "@/lib/pull";
import { REAL_PRODUCTS } from "@/lib/real-products";
import { reconcileCase, type CaseReconciliation } from "@/lib/reconcile";
import { formatTag, looksLikeTag, normalizeTag } from "@/lib/tag";
import { applyTagScan, findUnitByTag } from "@/lib/units";
import { createProduct } from "@/lib/settings/products";
import { upsertProductAccess } from "@/lib/settings/product-access";
import { listPullableLots, stockOnHand, type PullableLot } from "@/lib/stock";
import { listStockView, type StockViewRow } from "@/lib/stock-view";

export type StationMode = "arrive" | "use" | "return";

export function stationModesForRole(role: string): StationMode[] {
  if (role === "vendor_rep") return ["arrive"];
  if (role === "tech") return ["use", "return"];
  return [];
}

export type StationItem = {
  productId: number;
  catalogNumber: string;
  description: string;
  vendorId?: number;
  vendorName: string;
  hospitalOwned: boolean;
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
  /** Shown under the result, e.g. the product is on no contract. */
  notice: string | null;
  /** What each barcode decoded to, for checking against the printed label. */
  reads: string[];
  tagDisplay?: string;
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
    vendorId?: number;
    vendorName: string;
    hospitalOwned: boolean;
  };
  suggestedLot: string;
  suggestedExpiry: string;
  reads: string[];
  /**
   * Fallback when no lot label is scanned. Use: lots on hand, earliest expiry
   * first. Return: lots used on this case and not yet returned.
   */
  lots: PullableLot[];
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
  | "no_item"
  | "wrong_vendor"
  | "role"
  | "unknown_tag"
  | "tag_in_use"
  | "expired_unit"
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
  use: "KU pays now",
  return: "Returned to shelf",
};

function tagStationOutcome(
  result: Awaited<ReturnType<typeof applyTagScan>>,
  raw: string,
): StationOutcome {
  const display = formatTag(normalizeTag(raw) ?? raw);
  if (!result.ok) {
    if (result.code === "unknown_tag") {
      return {
        ok: false,
        status: "unknown",
        message: result.message,
        raw: display,
      };
    }
    const code: StationErrorCode =
      result.code === "expired"
        ? "expired_unit"
        : result.code === "no_case"
          ? "no_case"
          : result.code === "role"
            ? "role"
            : "other";
    return {
      ok: false,
      status: "error",
      code,
      message: result.message,
      item: result.unit
        ? {
            productId: result.unit.productId,
            catalogNumber: result.unit.catalogNumber,
            description: result.unit.description,
            vendorId: result.unit.vendorId,
            vendorName: result.unit.vendorName,
            hospitalOwned: result.unit.hospitalOwned,
            lot: result.unit.lot,
            expiry: result.unit.expiry,
            qty: 1,
          }
        : null,
    };
  }
  const unit = result.unit;
  const checkedOut = result.action === "checked_out";
  return {
    ok: true,
    status: "success",
    headline: checkedOut ? "Checked out" : "Returned",
    mode: checkedOut ? "use" : "return",
    item: {
      productId: unit.productId,
      catalogNumber: unit.catalogNumber,
      description: unit.description,
      vendorId: unit.vendorId,
      vendorName: unit.vendorName,
      hospitalOwned: unit.hospitalOwned,
      lot: unit.lot,
      expiry: unit.expiry,
      qty: 1,
    },
    reads: [`tag ${unit.tagDisplay}`],
    notice: checkedOut ? "KU pays now." : "Back on the shelf for the vendor.",
    tagDisplay: unit.tagDisplay,
  };
}

/** Prefill for typed lot entry, keyed by catalog number: the lot printed on each package. */
const LOT_HINTS: Record<string, { lot: string; expiry: string }> = {
  ...Object.fromEntries(
    REAL_PRODUCTS.map((item) => [
      item.catalogNumber,
      { lot: item.lot, expiry: item.expiry },
    ]),
  ),
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
    vendorId?: number;
    vendorName: string;
    hospitalOwned: boolean;
  },
  lot: string | null,
  expiry: string | null,
  qty = 1,
): StationItem {
  return {
    productId: product.productId,
    catalogNumber: product.catalogNumber,
    description: product.description,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    hospitalOwned: product.hospitalOwned,
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
    /** Product barcode scanned just before, still waiting for its lot and expiry. */
    pendingRaw?: string | null;
    lotSource?: "barcode" | "manual";
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

  const [actor] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const allowed = actor ? stationModesForRole(actor.role) : [];
  if (input.mode === "use" || input.mode === "return") {
    const linked = await findUnitByTag(raw, db);
    if (linked) {
      return tagStationOutcome(
        await applyTagScan({ tagRaw: raw, caseId: input.caseId ?? null }, userId, db),
        raw,
      );
    }
  }

  if (actor && !allowed.includes(input.mode)) {
    return {
      ok: false,
      status: "error",
      code: "role",
      message:
        actor.role === "vendor_rep"
          ? "Vendors can only check in their own products."
          : actor.role === "tech"
            ? "Techs can only check out or return items. Vendors check in stock."
            : "This role cannot scan at the station.",
      item: null,
    };
  }

  const scanned = parseBarcode(raw);
  if (isLotExpiryOnly(scanned)) {
    const pendingRaw = cleanRaw(input.pendingRaw ?? "");
    if (!pendingRaw) {
      return {
        ok: false,
        status: "error",
        code: "no_item",
        message: "Scan the item barcode first. This label has only lot and expiry.",
        item: null,
      };
    }
    const pair = pairLotScan(pendingRaw, scanned);
    if (!pair.ok) {
      return {
        ok: false,
        status: "error",
        code: "no_item",
        message: pair.message,
        item: null,
      };
    }
    const outcome = await applyStationScan(
      {
        mode: input.mode,
        rawBarcode: pendingRaw,
        caseId: input.caseId,
        lot: pair.lot ?? input.lot,
        expiry: pair.expiry ?? input.expiry,
        lotSource: pair.lot && pair.expiry ? "barcode" : "manual",
      },
      userId,
      db,
    );
    if (outcome.status === "success" || outcome.status === "needs_lot") {
      outcome.reads = [...outcome.reads, describeScan(scanned)];
    }
    return outcome;
  }

  const { parsed, product } = await identifyProduct(raw, db);
  if (!product) {
    if ((input.mode === "use" || input.mode === "return") && looksLikeTag(raw)) {
      const tag = normalizeTag(raw) ?? raw;
      await recordUnknownTag(tag, userId, db);
      return {
        ok: false,
        status: "unknown",
        message: `Unknown tag ${formatTag(tag)}. Nothing was checked out.`,
        raw: formatTag(tag),
      };
    }
    await recordUnmappedBarcode(
      raw,
      input.mode === "arrive" ? "arrival" : "station",
      userId,
      db,
      actor?.vendorId,
    );
    return {
      ok: false,
      status: "unknown",
      message:
        input.mode === "arrive"
          ? "Unknown barcode. Nothing was added to the shelf."
          : "Unknown barcode",
      raw,
    };
  }

  if (input.mode === "arrive" && actor?.role === "vendor_rep") {
    const ownVendor = actor.vendorId;
    if (
      product.hospitalOwned ||
      ownVendor == null ||
      product.vendorId !== ownVendor
    ) {
      await recordRejectedArrival(
        {
          rawBarcode: raw,
          actorVendorId: ownVendor ?? 0,
          productId: product.productId,
          reason: product.hospitalOwned ? "hospital_owned" : "wrong_vendor",
          productVendorName: product.vendorName,
        },
        userId,
        db,
      );
      return {
        ok: false,
        status: "error",
        code: "wrong_vendor",
        message: product.hospitalOwned
          ? `${product.description} is hospital-owned and already on the shelf. Vendors cannot check it in.`
          : `${product.description} belongs to ${product.vendorName}. You can only check in your own products.`,
        item: itemFrom(product, parsed.lot, parsed.expiry),
      };
    }
  }

  const lot = (input.lot?.trim() || parsed.lot || "").trim();
  const expiry = (input.expiry?.trim() || parsed.expiry || "").trim();
  if (!lot || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    const productInfo = {
      productId: product.productId,
      catalogNumber: product.catalogNumber,
      description: product.description,
      vendorId: product.vendorId,
      vendorName: product.vendorName,
      hospitalOwned: product.hospitalOwned,
    };
    if (input.mode === "use") {
      const lots = await listPullableLots(product.productId, new Date(), db);
      if (lots.length === 0) {
        return {
          ok: false,
          status: "error",
          code: "not_on_shelf",
          message: "Nothing on the shelf for this product. Ask the vendor to check it in.",
          item: itemFrom(productInfo, null, null),
        };
      }
      return {
        ok: false,
        status: "needs_lot",
        message: "Scan the lot and expiry barcode, or pick the lot. Earliest expiry is first.",
        raw,
        product: productInfo,
        reads: [describeScan(parsed)],
        suggestedLot: lots[0]!.lot,
        suggestedExpiry: lots[0]!.expiry,
        lots,
      };
    }
    if (input.mode === "return" && input.caseId) {
      const out = (await listCasePullLines(input.caseId, db)).filter(
        (line) =>
          line.productId === product.productId &&
          line.remaining > 0 &&
          line.lot &&
          line.expiry,
      );
      if (out.length > 0) {
        return {
          ok: false,
          status: "needs_lot",
          message: "Scan the lot and expiry barcode, or pick the lot coming back.",
          raw,
          product: productInfo,
          reads: [describeScan(parsed)],
          suggestedLot: out[0]!.lot!,
          suggestedExpiry: out[0]!.expiry!,
          lots: out.map((line) => ({
            lot: line.lot!,
            expiry: line.expiry!,
            locationId: line.locationId,
            onHand: line.remaining,
          })),
        };
      }
      return {
        ok: false,
        status: "error",
        code: "not_pulled",
        message: "Item not used for this case",
        item: itemFrom(productInfo, null, null),
      };
    }
    const hint = lotHint(raw, parsed, product.catalogNumber);
    return {
      ok: false,
      status: "needs_lot",
      message: "Scan the lot and expiry barcode, or enter them.",
      raw,
      product: productInfo,
      reads: [describeScan(parsed)],
      suggestedLot: lot || hint.lot,
      suggestedExpiry: /^\d{4}-\d{2}-\d{2}$/.test(expiry)
        ? expiry
        : hint.expiry,
      lots: [],
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
        message: "Open a case first",
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

  const lotSource =
    input.lotSource ?? (parsed.lot && parsed.expiry ? "barcode" : "manual");

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
    } else if (input.mode === "use") {
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
            message: "Duplicate — this lot is already used and the shelf is empty",
            item: knownItem,
          };
        }
        return {
          ok: false,
          status: "error",
          code: "not_on_shelf",
          message: "Nothing on the shelf for this lot. Ask the vendor to check it in.",
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
            : "Item not used for this case",
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
      await closeoutReturned(payload, userId, db);
    }
  } catch (error) {
    const message = errorText(error);
    if (/no matching pulled/i.test(message)) {
      return {
        ok: false,
        status: "error",
        code: "not_pulled",
        message: "Item not used for this case",
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

  const onContract = await productOnAnyContract(product.productId, db);
  return {
    ok: true,
    status: "success",
    headline: HEADLINES[input.mode],
    mode: input.mode,
    item: knownItem,
    reads: [describeScan(parsed)],
    notice:
      onContract || input.mode !== "use"
        ? null
        : "Not on any contract. Listed in Exceptions for review.",
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
  await resolveUnmappedBarcode(raw, product.id, userId, db);

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
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(vendors.name).then((rows) =>
      rows.filter((row) =>
        (COMMERCIAL_VENDOR_IDS as readonly number[]).includes(row.id),
      ),
    ),
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
