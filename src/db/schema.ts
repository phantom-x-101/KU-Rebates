import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// Catalog first so users can reference vendors (SQLite allows forward refs; Drizzle prefers order).

export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().unique(),
  externalId: text("external_id"),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").unique(),
    role: text("role").notNull(),
    vendorId: integer("vendor_id").references(() => vendors.id),
    active: integer("active").notNull().default(1),
  },
  (t) => [
    check(
      "users_role_check",
      sql`${t.role} IN ('tech','category_owner','supply_chain','admin','vendor_rep')`,
    ),
  ],
);

export const departments = sqliteTable(
  "departments",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull().unique(),
    phase: text("phase").notNull().default("later"),
  },
  (t) => [
    check(
      "departments_phase_check",
      sql`${t.phase} IN ('pilot','next','later')`,
    ),
  ],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: integer("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    name: text("name").notNull(),
  },
  (t) => [unique().on(t.departmentId, t.name)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: text("at")
      .notNull()
      .default(sql`(datetime('now'))`),
    userId: integer("user_id").references(() => users.id),
    container: integer("container"),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    action: text("action").notNull(),
    detail: text("detail"),
  },
  (t) => [
    check(
      "audit_log_container_check",
      sql`${t.container} IS NULL OR ${t.container} IN (1,2,3)`,
    ),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id),
    catalogNumber: text("catalog_number").notNull(),
    description: text("description").notNull(),
    category: text("category"),
    unitPrice: real("unit_price"),
    inItemMaster: integer("in_item_master").notNull().default(0),
  },
  (t) => [unique().on(t.vendorId, t.catalogNumber)],
);

export const productIdentifiers = sqliteTable(
  "product_identifiers",
  {
    id: integer("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    idType: text("id_type").notNull(),
    value: text("value").notNull(),
  },
  (t) => [
    unique().on(t.idType, t.value),
    check(
      "product_identifiers_id_type_check",
      sql`${t.idType} IN ('gtin','hibc','catalog','ku_item','workday_item','ghx')`,
    ),
  ],
);

export const procedureTypes = sqliteTable(
  "procedure_types",
  {
    id: integer("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    name: text("name").notNull(),
  },
  (t) => [unique().on(t.departmentId, t.name)],
);

export const cases = sqliteTable(
  "cases",
  {
    id: integer("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    roomId: integer("room_id").references(() => rooms.id),
    procedureTypeId: integer("procedure_type_id").references(
      () => procedureTypes.id,
    ),
    openedAt: text("opened_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    closedAt: text("closed_at"),
    openedBy: integer("opened_by").references(() => users.id),
    status: text("status").notNull().default("open"),
    epicScanTime: text("epic_scan_time"),
  },
  (t) => [
    check(
      "cases_status_check",
      sql`${t.status} IN ('open','closed','aborted')`,
    ),
  ],
);

export const scans = sqliteTable(
  "scans",
  {
    id: integer("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.id),
    scannedAt: text("scanned_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    scannedBy: integer("scanned_by").references(() => users.id),
    rawBarcode: text("raw_barcode").notNull(),
    barcodeFormat: text("barcode_format"),
    productId: integer("product_id").references(() => products.id),
    lot: text("lot"),
    expiry: text("expiry"),
    lotExpirySource: text("lot_expiry_source"),
    labelPhotoPath: text("label_photo_path"),
    status: text("status").notNull().default("used"),
    qty: integer("qty").notNull().default(1),
    overrideNote: text("override_note"),
  },
  (t) => [
    index("idx_scans_case").on(t.caseId),
    index("idx_scans_product").on(t.productId),
    check(
      "scans_barcode_format_check",
      sql`${t.barcodeFormat} IS NULL OR ${t.barcodeFormat} IN ('gs1','hibc','other')`,
    ),
    check(
      "scans_lot_expiry_source_check",
      sql`${t.lotExpirySource} IS NULL OR ${t.lotExpirySource} IN ('barcode','photo','manual')`,
    ),
    check(
      "scans_status_check",
      sql`${t.status} IN ('used','wasted','returned')`,
    ),
  ],
);

export const contracts = sqliteTable(
  "contracts",
  {
    id: integer("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id),
    name: text("name").notNull(),
    externalId: text("external_id"),
    contractType: text("contract_type"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    periodType: text("period_type").notNull().default("quarter"),
    countBasis: text("count_basis").notNull().default("used"),
    allLinesRequired: integer("all_lines_required").notNull().default(1),
    forecastMethod: text("forecast_method").notNull().default("run_rate"),
    status: text("status").notNull().default("active"),
  },
  (t) => [
    check(
      "contracts_contract_type_check",
      sql`${t.contractType} IS NULL OR ${t.contractType} IN ('gpo','direct','bundle')`,
    ),
    check(
      "contracts_period_type_check",
      sql`${t.periodType} IN ('month','quarter','year','custom')`,
    ),
    check(
      "contracts_count_basis_check",
      sql`${t.countBasis} IN ('used','purchased','invoiced')`,
    ),
    check(
      "contracts_forecast_method_check",
      sql`${t.forecastMethod} IN ('run_rate','case_schedule','historical')`,
    ),
    check(
      "contracts_status_check",
      sql`${t.status} IN ('draft','active','closed')`,
    ),
  ],
);

export const contractLines = sqliteTable(
  "contract_lines",
  {
    id: integer("id").primaryKey(),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id),
    name: text("name").notNull(),
    metric: text("metric").notNull().default("units"),
    requiredQty: real("required_qty").notNull(),
    unitPrice: real("unit_price"),
  },
  (t) => [
    check(
      "contract_lines_metric_check",
      sql`${t.metric} IN ('units','spend')`,
    ),
  ],
);

export const contractLineProducts = sqliteTable(
  "contract_line_products",
  {
    contractLineId: integer("contract_line_id")
      .notNull()
      .references(() => contractLines.id),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    countMultiplier: real("count_multiplier").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.contractLineId, t.productId] })],
);

export const contractTiers = sqliteTable(
  "contract_tiers",
  {
    id: integer("id").primaryKey(),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id),
    tierLevel: integer("tier_level").notNull(),
    thresholdNote: text("threshold_note"),
    rebateType: text("rebate_type").notNull(),
    rebateValue: real("rebate_value").notNull(),
  },
  (t) => [
    unique().on(t.contractId, t.tierLevel),
    check(
      "contract_tiers_rebate_type_check",
      sql`${t.rebateType} IN ('percent','flat')`,
    ),
  ],
);

export const usageMatches = sqliteTable(
  "usage_matches",
  {
    id: integer("id").primaryKey(),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scans.id),
    contractLineId: integer("contract_line_id")
      .notNull()
      .references(() => contractLines.id),
    countedQty: real("counted_qty").notNull(),
    countedAt: text("counted_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    source: text("source").notNull().default("scan"),
  },
  (t) => [
    unique().on(t.scanId, t.contractLineId, t.source),
    check(
      "usage_matches_source_check",
      sql`${t.source} IN ('scan','po_match','manual')`,
    ),
  ],
);

export const lineProgress = sqliteTable(
  "line_progress",
  {
    id: integer("id").primaryKey(),
    contractLineId: integer("contract_line_id")
      .notNull()
      .references(() => contractLines.id),
    asOf: text("as_of").notNull(),
    periodWeek: integer("period_week"),
    countedQty: real("counted_qty").notNull(),
    requiredQty: real("required_qty").notNull(),
    forecastQty: real("forecast_qty"),
    forecastMethod: text("forecast_method"),
    atRisk: integer("at_risk").notNull().default(0),
    rebateAtRisk: real("rebate_at_risk"),
  },
  (t) => [index("idx_progress_line").on(t.contractLineId, t.asOf)],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: integer("id").primaryKey(),
    contractLineId: integer("contract_line_id")
      .notNull()
      .references(() => contractLines.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    ownerUserId: integer("owner_user_id").references(() => users.id),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    decision: text("decision"),
    decidedAt: text("decided_at"),
  },
  (t) => [
    check(
      "alerts_status_check",
      sql`${t.status} IN ('open','acknowledged','decided','closed')`,
    ),
  ],
);

export const alertRules = sqliteTable("alert_rules", {
  id: integer("id").primaryKey(),
  contractId: integer("contract_id").references(() => contracts.id),
  atRiskPct: real("at_risk_pct").notNull().default(0.95),
  minWeeksLeft: integer("min_weeks_left").notNull().default(2),
  notifyUserId: integer("notify_user_id").references(() => users.id),
});

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: integer("id").primaryKey(),
    kind: text("kind").notNull(),
    filename: text("filename"),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    importedBy: integer("imported_by").references(() => users.id),
    rowCount: integer("row_count"),
  },
  (t) => [
    check(
      "import_batches_kind_check",
      sql`${t.kind} IN ('purchase_orders','vendor_credits','contracts','products')`,
    ),
  ],
);

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey(),
  batchId: integer("batch_id").references(() => importBatches.id),
  poNumber: text("po_number").notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id),
  poDate: text("po_date"),
});

export const poLines = sqliteTable("po_lines", {
  id: integer("id").primaryKey(),
  poId: integer("po_id")
    .notNull()
    .references(() => purchaseOrders.id),
  productId: integer("product_id").references(() => products.id),
  itemRef: text("item_ref"),
  qty: real("qty").notNull(),
  price: real("price"),
});

export const vendorCredits = sqliteTable("vendor_credits", {
  id: integer("id").primaryKey(),
  batchId: integer("batch_id").references(() => importBatches.id),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id),
  contractId: integer("contract_id").references(() => contracts.id),
  creditRef: text("credit_ref"),
  creditDate: text("credit_date"),
  amount: real("amount").notNull(),
});

export const settlementChecks = sqliteTable(
  "settlement_checks",
  {
    id: integer("id").primaryKey(),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    scannedUsedQty: real("scanned_used_qty"),
    poQty: real("po_qty"),
    creditedQty: real("credited_qty"),
    expectedRebate: real("expected_rebate"),
    receivedCredit: real("received_credit"),
    gap: real("gap"),
    outcome: text("outcome"),
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    check(
      "settlement_checks_outcome_check",
      sql`${t.outcome} IS NULL OR ${t.outcome} IN ('match','dispute')`,
    ),
  ],
);

export const exceptions = sqliteTable(
  "exceptions",
  {
    id: integer("id").primaryKey(),
    sourceContainer: integer("source_container").notNull(),
    type: text("type").notNull(),
    scanId: integer("scan_id").references(() => scans.id),
    productId: integer("product_id").references(() => products.id),
    contractLineId: integer("contract_line_id").references(
      () => contractLines.id,
    ),
    status: text("status").notNull().default("open"),
    ownerUserId: integer("owner_user_id").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    resolvedAt: text("resolved_at"),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    check(
      "exceptions_source_container_check",
      sql`${t.sourceContainer} IN (1,2,3)`,
    ),
    check(
      "exceptions_type_check",
      sql`${t.type} IN (
        'not_on_any_contract','bill_only_unmapped','missing_from_item_master',
        'opened_or_wasted','taken_not_scanned_or_returned','expired_on_shelf')`,
    ),
    check(
      "exceptions_status_check",
      sql`${t.status} IN ('open','in_review','resolved')`,
    ),
  ],
);

export const disputes = sqliteTable(
  "disputes",
  {
    id: integer("id").primaryKey(),
    settlementId: integer("settlement_id").references(
      () => settlementChecks.id,
    ),
    type: text("type").notNull(),
    vendorId: integer("vendor_id").references(() => vendors.id),
    amountAtIssue: real("amount_at_issue"),
    status: text("status").notNull().default("open"),
    ownerUserId: integer("owner_user_id").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    resolvedAt: text("resolved_at"),
    note: text("note"),
  },
  (t) => [
    check(
      "disputes_type_check",
      sql`${t.type} IN ('credit_lower_than_expected','price_mismatch_contract')`,
    ),
    check(
      "disputes_status_check",
      sql`${t.status} IN ('open','sent_to_vendor','resolved','written_off')`,
    ),
  ],
);

export const storageLocations = sqliteTable(
  "storage_locations",
  {
    id: integer("id").primaryKey(),
    departmentId: integer("department_id").references(() => departments.id),
    name: text("name").notNull(),
    storageType: text("storage_type"),
  },
  (t) => [
    check(
      "storage_locations_storage_type_check",
      sql`${t.storageType} IS NULL OR ${t.storageType} IN ('shelf','room','central','controlled')`,
    ),
  ],
);

export const productAccess = sqliteTable(
  "product_access",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    accessMode: text("access_mode").notNull(),
    locationId: integer("location_id").references(() => storageLocations.id),
    parLevel: integer("par_level"),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.departmentId] }),
    check(
      "product_access_access_mode_check",
      sql`${t.accessMode} IN ('on_shelf','brought_in_for_case','not_kept_in_stock')`,
    ),
  ],
);

export const stockEvents = sqliteTable(
  "stock_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    locationId: integer("location_id").references(() => storageLocations.id),
    caseId: integer("case_id").references(() => cases.id),
    lot: text("lot"),
    expiry: text("expiry"),
    qty: integer("qty").notNull().default(1),
    at: text("at")
      .notNull()
      .default(sql`(datetime('now'))`),
    byUserId: integer("by_user_id").references(() => users.id),
  },
  (t) => [
    index("idx_stock_product").on(t.productId, t.eventType),
    check(
      "stock_events_event_type_check",
      sql`${t.eventType} IN ('arrived','pulled','returned','expired')`,
    ),
  ],
);

export const expiryRules = sqliteTable("expiry_rules", {
  id: integer("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id),
  daysBefore: integer("days_before").notNull().default(60),
  vendorPaysExpired: integer("vendor_pays_expired").notNull().default(1),
});

export type User = typeof users.$inferSelect;
export type UserRole =
  | "tech"
  | "category_owner"
  | "supply_chain"
  | "admin"
  | "vendor_rep";

export type StockEventType = "arrived" | "pulled" | "returned" | "expired";
