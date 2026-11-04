# Consignment (Container 1): workflow spec

Source: *ku-rebate-workflowv8.pdf*, pages 1 to 4, 7 and 11 to 12, rewritten as text. Numbers and vendor names marked (placeholder) are not real KU data.

## Purpose

Show, without an on-site audit, what stock is where, what was taken for each case, what was used, returned or wasted, and what is about to expire. KU's own steps stay exactly as they are. Pycube adds its scans alongside and writes nothing back to Epic, GE or Workday.

## KU today (as mapped on site)

1. Supplies are **on the lab's shelf** (the vendor rep keeps the shelf stocked on consignment) **or brought in for the case**.
2. The tech **collects and preps** the items for the case.
3. Items are **used in the case**, or opened and wasted, or put back.
4. KU **reorders by par level or low stock** (requisition), otherwise by expiry. Restocking of consignment: to confirm with KU.
5. KU pays only for what was used. The vendor keeps ownership of unused consignment stock. Expired stock on the shelf is paid for by the vendor.

Pain points seen on site: shelves look like a pantry and are hard to read at a glance; shipments arrive often and inventory is updated by hand; dedicated staff visually check and order by consumption; items sit past expiry before use (the "overflow" problem). The vendors themselves suggested a system.

## How items reach the room (three modes: a setting per product and department)

| Mode | Today | What Pycube does | Examples |
|---|---|---|---|
| `on_shelf` | Vendor keeps shelf stocked; KU pays only on use; tech pulls what the case needs | Scan on arrival (later), scan when pulled (later), expiry alerts to the rep | EP catheters, sheaths, closure devices |
| `brought_in_for_case` | Not on shelf beforehand; brought in for this case; tech collects and preps; unused goes back | Logged as it enters the room so unused items are seen leaving | EP items for one case; ortho hips and knees in several sizes |
| `not_kept_in_stock` | Too costly or needs controlled temperature or humidity; requested a day or so before the case | Logged when it arrives for the case, then scanned after the case | High-cost implants |

## What Pycube adds (this build)

- **Scan on arrival**: stock is logged as it reaches the shelf or room (item, lot, expiry, location, time).
- **Scan when pulled**: items are logged as the tech collects them for a case (linked to a case).
- **Case close-out (thin slice of Container 2)**: after the case every item taken is marked **used**, **wasted** (opened) or **returned**. The tech does this at the node. The full Epic-adjacent scan flow is built later.
- **Vendor portal**: each rep sees only their own stock, usage and expiry dates, with no on-site audit.
- **Expiry alerts**: the rep is alerted before expiry (days set per vendor). Expired stock is flagged "expired on shelf: rep pays".
- **Reorder view**: shows par level vs on-hand and suggests when stock is low. KU places the order; Pycube never does.
- **IEN at the door (later)**: logs what comes into the room so leftovers are sorted into used, opened and returned. Not in this build.

## The check: Taken = used + returned

For each case: quantity taken (pulled) must equal used + wasted + returned. Any gap creates an exception, `taken_not_scanned_or_returned`, with `source_container = 1`. A match moves on to Container 3 (not built yet).

Example from the document: 3 taken for the case = 2 used + 1 returned.

## Exceptions this build creates

| Type | When | Owner |
|---|---|---|
| `taken_not_scanned_or_returned` | Pulled for a case but not closed out as used, wasted or returned | supply_chain |
| `expired_on_shelf` | On-hand lot past its expiry date | supply_chain (the rep pays) |
| `opened_or_wasted` | Item closed out as wasted | supply_chain |

## Roles

- **tech**: scan on arrival, scan when pulled, open and close a case, close-out
- **supply_chain**: stock view, reorder view, exception queue, settings
- **vendor_rep**: portal only, own vendor's stock, usage and expiry
- **admin**: everything, including seed and imports

## Settings (change with product, vendor, storage)

- Products and vendors, with identifiers (GTIN, HIBC, catalog number)
- Storage locations (shelf, room, central supply, controlled storage)
- `product_access`: mode per product and department, location, par level
- `expiry_rules`: days before expiry to alert the rep, and whether the vendor pays for expired stock

## Out of scope for this build

Contracts, tiers, rebate calculation, forecasting, settlement and dispute screens (Container 3); the Epic-adjacent post-case scan flow (Container 2); label photo reading; any integration with Epic, GE, Workday or GHX.

## Start with the EP lab

EP lab is mapped. Cath lab is next (shelves, hanging stock and blue bags). Ortho is later (hips and knees in several sizes). A new lab only changes the settings for that lab.

## Demo seed data (placeholders unless noted)

- Vendors: Terumo, Cardiva (both real labels), Vendor C (placeholder)
- Terumo Pinnacle sheath 8 Fr, item RSS802, lot 0001681425, expiry 2028-11-01 (GS1)
- Cardiva Vascade MVP closure, item 800-612C, lot G612C260420B, expiry 2028-04-09 (HIBC)
- Vendor C ablation catheter and mapping catheter (placeholders)
- One EP case: 5 items pulled (sheath, closure, ablation catheter, mapping catheter x2); close-out: 4 used, 1 returned; one lot seeded as expiring within 30 days to demonstrate the alert; one seeded gap to demonstrate the exception
