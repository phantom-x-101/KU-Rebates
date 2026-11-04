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

## Settings (Phase 2)

Sign in as **admin** or **supply_chain**, then open `/settings` to manage vendors, products (GTIN/HIBC/catalog), storage locations, product access (mode + par), and expiry rules.

## Phase 1

Scaffold + Drizzle/SQLite schema, `stockOnHand`, seed, user picker, `audit()` helper.
