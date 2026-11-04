# KU Rebate Management: Data Model and Build Rules

Companion to `ku-schema.sql`. Source: *ku-rebate-workflowv8.pdf*.

## Non-negotiable constraints (put these in Cursor's rules file)

1. **No patient identifiers.** No MRN, name, DOB or encounter number in any table, log or UI. A case holds only department, room, procedure type and time.
2. **No write-back.** Nothing is ever sent to Epic, GE or Workday. KU data comes in as file imports only (POs, vendor credits, contracts, products).
3. **Day one = Consumption + Contracts.** Consignment tables exist but stay empty and unused until the later phase. Do not build their screens yet.
4. **Every step is time-stamped** and writes to `audit_log`.
5. **Every problem records which container it came from** (`source_container` 1, 2 or 3).

## How the tables map to the three containers

| Container | Phase | Tables |
|---|---|---|
| Shared | Day one | users, departments, rooms, audit_log, app_settings, vendors, products, product_identifiers, exceptions, disputes |
| 2 Consumption | Day one | procedure_types, cases, scans |
| 3 Contracts | Day one | contracts, contract_lines, contract_line_products, contract_tiers, usage_matches, line_progress, alerts, alert_rules, import_batches, purchase_orders, po_lines, vendor_credits, settlement_checks |
| 1 Consignment | Later | storage_locations, product_access, stock_events, expiry_rules, v_case_reconciliation |

## Core flow in terms of the tables

1. **Tech opens a case** at the node (`cases`: department, room, procedure type).
2. **Tech scans each used item** (`scans`). The app parses the barcode, then looks up `product_identifiers` to set `product_id`.
   - GS1 barcode: item, lot and expiry come from the barcode (`lot_expiry_source = 'barcode'`).
   - HIBC barcode: item only. Lot and expiry are read from a label photo (`'photo'`), or typed in (`'manual'`).
3. **Opened or wasted items** are scanned with `status = 'wasted'` and also create an `exceptions` row of type `opened_or_wasted`. An aborted case sets `cases.status = 'aborted'`.
4. **Identification failures** create exceptions:
   - no product match: `bill_only_unmapped`
   - product found but `in_item_master = 0` and on a contract: `missing_from_item_master`
   - product on no contract line: `not_on_any_contract`
5. **Matching to contracts.** For each scan with a product, find every `contract_line_products` row for that product. Insert one `usage_matches` row per line, for contracts that are active on the scan date. A single scan can create 3 to 5 rows.
6. **Progress and forecast.** A scheduled job (or a recompute on demand) writes `line_progress`: counted qty, required qty, forecast at period close, at-risk flag, rebate at risk.
7. **Alert.** If forecast is below `alert_rules.at_risk_pct` of required and weeks left is at or above `min_weeks_left`, create an `alerts` row for the category owner. The owner records the decision. KU decides and Pycube never orders.
8. **Settlement check** (at period close, from imported files). Compare scanned-as-used quantity, PO quantity and credited quantity.
   - All match: `settlement_checks.outcome = 'match'`, close and record.
   - Any gap: `outcome = 'dispute'` and create a `disputes` row (`credit_lower_than_expected` or `price_mismatch_contract`).

## Rules you must decide, and where they live

| Open decision | Where it lives | Suggested default |
|---|---|---|
| Does a tier count units used, purchased or invoiced? | `contracts.count_basis` | `used` (matches consignment: KU pays on use) |
| Is the rebate lost if one line misses? | `contracts.all_lines_required` | `1` for bundle contracts |
| How is the forecast calculated? | `contracts.forecast_method` | `run_rate` (counted so far / weeks elapsed x total weeks) |
| When is a line "at risk"? | `alert_rules` | forecast under 95% of required, 2 or more weeks left |
| What counts when a product is on several contracts? | `contract_line_products.count_multiplier` per line | `1` on each line |

If `count_basis` is `purchased` or `invoiced`, step 5 must read from `po_lines` and `vendor_credits` instead of `scans`. Keep the matching code behind one function so this can change without touching the rest of the app.

## Screens (day one)

1. **Node: scan.** Open case, scan item, show the item identified, mark wasted, close case.
2. **Contract progress.** One card per contract with a bar per line: counted vs required, forecast, at-risk flag.
3. **Alerts.** Open alerts for the category owner with a decision field.
4. **Exception queue.** Filter by type and source container, assign an owner, resolve with a note.
5. **Settlement check.** Used = paid = credited per contract, with the dispute queue beside it.
6. **Imports.** Upload POs, vendor credits, contracts and products.

## Seed data (all placeholders unless noted)

- **Bundle contract "Vendor X"**, week 9 of 13, three lines each needing 50:
  - Line A (catheter, $10K each): counted 52
  - Line B (stent, $20K each): counted 48. This is the line at risk, with a $1M rebate.
  - Line C (implant, $25K each): counted 55
  - Slide 9's walkthrough: forecast 48, one unit found in PO matching (49), KU orders one more (50).
- **Real labels from the packaging photos (slide 6):**
  - Terumo Pinnacle sheath 8 Fr, item RSS802, lot 0001681425, expiry 1 Nov 2028 (GS1)
  - Cardiva Vascade MVP closure, item 800-612C, lot G612C260420B, expiry 9 Apr 2028 (HIBC: lot and expiry come from the label photo)
- **Departments:** EP lab (pilot), Cath lab (next), Ortho (later).
- **Case example (slide 6):** one EP case, 5 items: sheath (Terumo), closure (Cardiva), ablation catheter (Vendor C), mapping catheter x2 (Vendor C).
- **Settings:** `epic_integration = off`, `workday_integration = off`.

## Notes for the build

- `users` references `vendors` before `vendors` is created. SQLite accepts this. On Postgres, create `vendors` first.
- Use one `exceptions` table for all problems (the doc shows one queue with a container tag), and a separate `disputes` table for settlement gaps.
- The `v_case_reconciliation` view (taken = used + returned) is for the later phase. Do not surface it in the day-one UI.
