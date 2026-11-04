# KU Rebate Management (prototype)

Pycube consignment prototype that runs alongside KU Medical Center workflows. Demo data only.

## Hard constraints

- No patient identifiers (no MRN, name, DOB, encounter)
- No write-back to Epic, GE, or Workday
- Stock on hand is derived from `stock_events` (never stored)

## Setup

```bash
npm install
npm run db:seed
npm run dev
```

Open http://localhost:3000 and pick a user in the header to change role.

## Tests

```bash
npm test
```

## Exceptions (Phase 5)

Sign in as **supply_chain** or **admin**, open `/exceptions`. Filter by type/container, assign an owner, resolve with a note. Closing a case (or the timeout check) creates `taken_not_scanned_or_returned` gaps with `source_container = 1`.

## Cases (Phase 4)

Sign in as **tech** (or supply_chain / admin), open `/cases`:

1. Open a case (department / room / procedure — no patient data)
2. Scan items as pulled
3. Close out each line as used, wasted, or returned; or abort the case

## Scan on arrival (Phase 3)

Sign in as **tech**, **supply_chain**, or **admin**, then open `/scan/arrival`.

- Terumo GS1 sample fills lot `0001681425` and expiry `2028-11-01`
- Cardiva HIBC sample is item-only — enter lot/expiry manually
- Unknown barcodes show an error with a link to add the product (settings roles)

## Settings (Phase 2)

Sign in as **admin** or **supply_chain**, then open `/settings` to manage vendors, products (GTIN/HIBC/catalog), storage locations, product access (mode + par), and expiry rules.

## Phase 1

Scaffold + Drizzle/SQLite schema, `stockOnHand`, seed, user picker, `audit()` helper.
