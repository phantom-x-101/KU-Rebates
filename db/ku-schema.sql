-- KU Rebate Management prototype: data model
-- Written for SQLite; works on Postgres with minor type changes (INTEGER PRIMARY KEY -> SERIAL/IDENTITY, TEXT dates -> TIMESTAMPTZ).
-- Hard constraints from the workflow doc:
--   * NO patient identifiers anywhere (no MRN, name, DOB, encounter number).
--   * Pycube writes nothing back to Epic, GE or Workday. Imports are one-way.
--   * Day one = Consumption + Contracts. Consignment tables exist but stay unused until the later phase.

PRAGMA foreign_keys = ON;

-- =====================================================================
-- SHARED
-- =====================================================================
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('tech','category_owner','supply_chain','admin','vendor_rep')),
  vendor_id     INTEGER REFERENCES vendors(id),      -- only for vendor_rep (later phase)
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE departments (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,                         -- EP lab, Cath lab, Ortho
  phase TEXT NOT NULL DEFAULT 'later' CHECK (phase IN ('pilot','next','later'))
);

CREATE TABLE rooms (
  id            INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  name          TEXT NOT NULL,
  UNIQUE (department_id, name)
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  user_id     INTEGER REFERENCES users(id),
  container   INTEGER CHECK (container IN (1,2,3)),   -- 1 consignment, 2 consumption, 3 contracts
  entity      TEXT NOT NULL,
  entity_id   INTEGER,
  action      TEXT NOT NULL,
  detail      TEXT
);

CREATE TABLE app_settings (                            -- integration switches and global rules
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Suggested seeds: epic_integration='off', workday_integration='off',
--                  default_count_basis='used', default_forecast_method='run_rate'

-- =====================================================================
-- CATALOG (used by containers 1, 2, 3)
-- =====================================================================
CREATE TABLE vendors (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  external_id TEXT                                    -- KU vendor number in Workday
);

CREATE TABLE products (
  id             INTEGER PRIMARY KEY,
  vendor_id      INTEGER NOT NULL REFERENCES vendors(id),
  catalog_number TEXT NOT NULL,                       -- e.g. RSS802, 800-612C
  description    TEXT NOT NULL,
  category       TEXT,                                -- sheath, closure, ablation catheter, mapping catheter...
  unit_price     REAL,                                -- contract or list price used for expected rebate
  in_item_master INTEGER NOT NULL DEFAULT 0,          -- 0 = contracted-but-not-mastered candidate
  UNIQUE (vendor_id, catalog_number)
);

-- The identifier crosswalk: barcode/GTIN, HIBC, vendor catalog, KU/Workday item, GHX
CREATE TABLE product_identifiers (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  id_type    TEXT NOT NULL CHECK (id_type IN ('gtin','hibc','catalog','ku_item','workday_item','ghx')),
  value      TEXT NOT NULL,
  UNIQUE (id_type, value)
);

-- =====================================================================
-- CONTAINER 2: CONSUMPTION (day one)
-- =====================================================================
CREATE TABLE procedure_types (
  id            INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  name          TEXT NOT NULL,                        -- ablation, mapping, diagnostic...
  UNIQUE (department_id, name)
);

-- A "case" is a node-generated container for scans. No patient link.
CREATE TABLE cases (
  id                INTEGER PRIMARY KEY,
  department_id     INTEGER NOT NULL REFERENCES departments(id),
  room_id           INTEGER REFERENCES rooms(id),
  procedure_type_id INTEGER REFERENCES procedure_types(id),
  opened_at         TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at         TEXT,
  opened_by         INTEGER REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','aborted')),
  epic_scan_time    TEXT                              -- optional: tech enters when the Epic scan happened, for time-window matching
);

CREATE TABLE scans (
  id                INTEGER PRIMARY KEY,
  case_id           INTEGER NOT NULL REFERENCES cases(id),
  scanned_at        TEXT NOT NULL DEFAULT (datetime('now')),
  scanned_by        INTEGER REFERENCES users(id),
  raw_barcode       TEXT NOT NULL,
  barcode_format    TEXT CHECK (barcode_format IN ('gs1','hibc','other')),
  product_id        INTEGER REFERENCES products(id),  -- NULL until identified
  lot               TEXT,
  expiry            TEXT,                             -- ISO date
  lot_expiry_source TEXT CHECK (lot_expiry_source IN ('barcode','photo','manual')),
  label_photo_path  TEXT,
  status            TEXT NOT NULL DEFAULT 'used' CHECK (status IN ('used','wasted','returned')),  -- returned = later phase
  qty               INTEGER NOT NULL DEFAULT 1,
  override_note     TEXT
);
CREATE INDEX idx_scans_case ON scans(case_id);
CREATE INDEX idx_scans_product ON scans(product_id);

-- =====================================================================
-- CONTAINER 3: CONTRACTS (day one)
-- =====================================================================
CREATE TABLE contracts (
  id             INTEGER PRIMARY KEY,
  vendor_id      INTEGER NOT NULL REFERENCES vendors(id),
  name           TEXT NOT NULL,
  external_id    TEXT,                                -- KU contract number (ERP)
  contract_type  TEXT CHECK (contract_type IN ('gpo','direct','bundle')),
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  period_type    TEXT NOT NULL DEFAULT 'quarter' CHECK (period_type IN ('month','quarter','year','custom')),
  count_basis    TEXT NOT NULL DEFAULT 'used' CHECK (count_basis IN ('used','purchased','invoiced')),  -- OPEN DECISION: default 'used'
  all_lines_required INTEGER NOT NULL DEFAULT 1,      -- bundle rule: every line must hit its tier or the rebate is lost
  forecast_method TEXT NOT NULL DEFAULT 'run_rate' CHECK (forecast_method IN ('run_rate','case_schedule','historical')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed'))
);

CREATE TABLE contract_lines (
  id            INTEGER PRIMARY KEY,
  contract_id   INTEGER NOT NULL REFERENCES contracts(id),
  name          TEXT NOT NULL,                        -- Line A / catheter
  metric        TEXT NOT NULL DEFAULT 'units' CHECK (metric IN ('units','spend')),
  required_qty  REAL NOT NULL,                        -- e.g. 50 needed per line
  unit_price    REAL                                  -- e.g. 10000, 20000, 25000
);

-- One product can sit on several lines and several contracts (3 to 5).
CREATE TABLE contract_line_products (
  contract_line_id INTEGER NOT NULL REFERENCES contract_lines(id),
  product_id       INTEGER NOT NULL REFERENCES products(id),
  count_multiplier REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (contract_line_id, product_id)
);

CREATE TABLE contract_tiers (
  id            INTEGER PRIMARY KEY,
  contract_id   INTEGER NOT NULL REFERENCES contracts(id),
  tier_level    INTEGER NOT NULL,
  threshold_note TEXT,                                -- e.g. "all lines at 50"
  rebate_type   TEXT NOT NULL CHECK (rebate_type IN ('percent','flat')),
  rebate_value  REAL NOT NULL,                        -- percent of eligible spend, or flat dollars (e.g. 1000000)
  UNIQUE (contract_id, tier_level)
);

-- Which scans count toward which line, and how much. One scan can create several rows.
CREATE TABLE usage_matches (
  id               INTEGER PRIMARY KEY,
  scan_id          INTEGER NOT NULL REFERENCES scans(id),
  contract_line_id INTEGER NOT NULL REFERENCES contract_lines(id),
  counted_qty      REAL NOT NULL,
  counted_at       TEXT NOT NULL DEFAULT (datetime('now')),
  source           TEXT NOT NULL DEFAULT 'scan' CHECK (source IN ('scan','po_match','manual')),  -- po_match = unit found by PO matching
  UNIQUE (scan_id, contract_line_id, source)
);

CREATE TABLE line_progress (                          -- weekly (or on-demand) snapshots
  id               INTEGER PRIMARY KEY,
  contract_line_id INTEGER NOT NULL REFERENCES contract_lines(id),
  as_of            TEXT NOT NULL,
  period_week      INTEGER,
  counted_qty      REAL NOT NULL,
  required_qty     REAL NOT NULL,
  forecast_qty     REAL,
  forecast_method  TEXT,
  at_risk          INTEGER NOT NULL DEFAULT 0,
  rebate_at_risk   REAL
);
CREATE INDEX idx_progress_line ON line_progress(contract_line_id, as_of);

CREATE TABLE alerts (
  id               INTEGER PRIMARY KEY,
  contract_line_id INTEGER NOT NULL REFERENCES contract_lines(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  owner_user_id    INTEGER REFERENCES users(id),      -- category owner
  message          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','decided','closed')),
  decision         TEXT,                              -- KU's decision, free text
  decided_at       TEXT
);

CREATE TABLE alert_rules (
  id               INTEGER PRIMARY KEY,
  contract_id      INTEGER REFERENCES contracts(id),  -- NULL = global default
  at_risk_pct      REAL NOT NULL DEFAULT 0.95,        -- forecast below this share of required = at risk
  min_weeks_left   INTEGER NOT NULL DEFAULT 2,
  notify_user_id   INTEGER REFERENCES users(id)
);

-- ---- Imports (one-way: files from KU, nothing written back) ----
CREATE TABLE import_batches (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('purchase_orders','vendor_credits','contracts','products')),
  filename    TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  imported_by INTEGER REFERENCES users(id),
  row_count   INTEGER
);

CREATE TABLE purchase_orders (
  id          INTEGER PRIMARY KEY,
  batch_id    INTEGER REFERENCES import_batches(id),
  po_number   TEXT NOT NULL,
  vendor_id   INTEGER REFERENCES vendors(id),
  po_date     TEXT
);

CREATE TABLE po_lines (
  id          INTEGER PRIMARY KEY,
  po_id       INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_id  INTEGER REFERENCES products(id),        -- NULL if the PO item is not mapped yet
  item_ref    TEXT,
  qty         REAL NOT NULL,
  price       REAL
);

CREATE TABLE vendor_credits (
  id          INTEGER PRIMARY KEY,
  batch_id    INTEGER REFERENCES import_batches(id),
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id),
  contract_id INTEGER REFERENCES contracts(id),
  credit_ref  TEXT,
  credit_date TEXT,
  amount      REAL NOT NULL
);

CREATE TABLE settlement_checks (
  id               INTEGER PRIMARY KEY,
  contract_id      INTEGER NOT NULL REFERENCES contracts(id),
  period_start     TEXT NOT NULL,
  period_end       TEXT NOT NULL,
  scanned_used_qty REAL,                              -- "5 scanned as used"
  po_qty           REAL,                              -- "5 on KU's POs"
  credited_qty     REAL,                              -- "5 credited by vendor"
  expected_rebate  REAL,
  received_credit  REAL,
  gap              REAL,
  outcome          TEXT CHECK (outcome IN ('match','dispute')),
  checked_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================================
-- QUEUES (both containers feed these; each row says where it came from)
-- =====================================================================
CREATE TABLE exceptions (
  id               INTEGER PRIMARY KEY,
  source_container INTEGER NOT NULL CHECK (source_container IN (1,2,3)),
  type             TEXT NOT NULL CHECK (type IN (
                     'not_on_any_contract','bill_only_unmapped','missing_from_item_master',
                     'opened_or_wasted','taken_not_scanned_or_returned','expired_on_shelf',
                     'closeout_exceeds_taken')),
  scan_id          INTEGER REFERENCES scans(id),
  product_id       INTEGER REFERENCES products(id),
  contract_line_id INTEGER REFERENCES contract_lines(id),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved')),
  owner_user_id    INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at      TEXT,
  resolution_note  TEXT
);

CREATE TABLE disputes (
  id               INTEGER PRIMARY KEY,
  settlement_id    INTEGER REFERENCES settlement_checks(id),
  type             TEXT NOT NULL CHECK (type IN ('credit_lower_than_expected','price_mismatch_contract')),
  vendor_id        INTEGER REFERENCES vendors(id),
  amount_at_issue  REAL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','sent_to_vendor','resolved','written_off')),
  owner_user_id    INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at      TEXT,
  note             TEXT
);

-- =====================================================================
-- CONTAINER 1: CONSIGNMENT (later phase: create now, leave empty)
-- =====================================================================
CREATE TABLE storage_locations (
  id            INTEGER PRIMARY KEY,
  department_id INTEGER REFERENCES departments(id),
  name          TEXT NOT NULL,                        -- shelf, hanging stock, blue bag, central supply
  storage_type  TEXT CHECK (storage_type IN ('shelf','room','central','controlled'))
);

CREATE TABLE product_access (                         -- how each product reaches the room
  product_id      INTEGER NOT NULL REFERENCES products(id),
  department_id   INTEGER NOT NULL REFERENCES departments(id),
  access_mode     TEXT NOT NULL CHECK (access_mode IN ('on_shelf','brought_in_for_case','not_kept_in_stock')),
  location_id     INTEGER REFERENCES storage_locations(id),
  par_level       INTEGER,
  PRIMARY KEY (product_id, department_id)
);

CREATE TABLE stock_events (
  id          INTEGER PRIMARY KEY,
  event_type  TEXT NOT NULL CHECK (event_type IN ('arrived','pulled','returned','expired')),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER REFERENCES storage_locations(id),
  case_id     INTEGER REFERENCES cases(id),           -- set on 'pulled' / 'returned'
  lot         TEXT,
  expiry      TEXT,
  qty         INTEGER NOT NULL DEFAULT 1,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  by_user_id  INTEGER REFERENCES users(id)
);
CREATE INDEX idx_stock_product ON stock_events(product_id, event_type);

CREATE TABLE expiry_rules (
  id             INTEGER PRIMARY KEY,
  vendor_id      INTEGER REFERENCES vendors(id),
  days_before    INTEGER NOT NULL DEFAULT 60,         -- alert the rep this many days before expiry
  vendor_pays_expired INTEGER NOT NULL DEFAULT 1
);

-- Check 1 to 2 (later): taken = used + returned
CREATE VIEW v_case_reconciliation AS
SELECT c.id AS case_id,
       SUM(CASE WHEN e.event_type = 'pulled'   THEN e.qty ELSE 0 END) AS taken,
       (SELECT COALESCE(SUM(s.qty),0) FROM scans s WHERE s.case_id = c.id AND s.status IN ('used','wasted')) AS used,
       SUM(CASE WHEN e.event_type = 'returned' THEN e.qty ELSE 0 END) AS returned
FROM cases c LEFT JOIN stock_events e ON e.case_id = c.id
GROUP BY c.id;
