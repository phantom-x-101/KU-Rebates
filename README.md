# KU Rebate Management (prototype)

Pycube consignment prototype alongside KU Medical Center workflows. **Demo data only.**

Hard constraints: no patient identifiers; no write-back to Epic, GE, or Workday; stock on hand is derived from `stock_events`.

## Run the full demo (&lt; 5 minutes)

```bash
npm install
npm run db:seed    # resets SQLite to a clean demo state
npm run dev        # http://localhost:3000
```

1. Pick **Sam Supply** (`supply_chain`) in the header.
2. Open **Dashboard** — taken today, open exceptions, expiring ≤30 days, low stock.
3. Walk Stock, Cases, Exceptions, Reorder, Settings as needed.
4. Pick **Terry Terumo Rep** for the vendor portal (`/vendor`).

```bash
npm test           # unit tests (Vitest)
```

Re-seed anytime with `npm run db:seed` (deletes `data/ku.sqlite` and rebuilds).

Footer on every page: *Demo data. Vendor X and Vendor C are placeholders.*

## Phase map

| Phase | What |
|-------|------|
| 1 | Scaffold, Drizzle/SQLite, seed, user picker, `audit()` |
| 2 | Settings (vendors, products, locations, access, expiry rules) |
| 3 | Scan on arrival + barcode parser (GS1 / HIBC) |
| 4 | Cases, pull scans, close-out (used / wasted / returned) |
| 5 | Reconcile check + exception queue |
| 6 | Stock view, expiry flags, reorder suggestions (no order button) |
| 7 | Vendor portal (own vendor only) |
| 8 | Supply-chain dashboard, clean seed reset, demo footer + README |

## Useful routes

- `/dashboard` — supply_chain / admin snapshot
- `/stock`, `/reorder`, `/exceptions`, `/settings`
- `/cases`, `/scan/arrival`
- `/vendor` — vendor_rep only
