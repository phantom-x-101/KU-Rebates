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
- **Case close-out (thin slice of Container 2)**: after the case the tech scans back each item that is **returned**. Anything taken and not returned counts as **used**. The full Epic-adjacent scan flow is built later.
- **Vendor portal**: each rep sees only their own stock, usage and expiry dates, with no on-site audit.
- **Expiry alerts**: the rep is alerted before expiry (days set per vendor). Expired stock is flagged "expired on shelf: rep pays".
- **Reorder view**: shows par level vs on-hand and suggests when stock is low. KU places the order; Pycube never does.
- **IEN at the door (later)**: logs what comes into the room so leftovers are sorted into used, opened and returned. Not in this build.

## The check: Taken = used + returned

For each case: taken (pulled) = returned + used, where used is everything not returned. There is no gap, so closing a case never creates an exception. The close shows "Used (not returned): N" and "Returned: N". The result moves on to Container 3 (not built yet).

Example from the document: 3 taken for the case, 1 returned, so 2 used.

## Exceptions this build creates

| Type | When | Owner |
|---|---|---|
| `case_open_past_timeout` | A case is still open after the close-out timeout (setting `case_closeout_timeout_hours`, default 24). Checked when the Exceptions page loads; one row per case | supply_chain |
| `expired_on_shelf` | On-hand lot past its expiry date | supply_chain (the rep pays) |
| `bill_only_unmapped` | A scanned barcode matches no product (station, arrival or pull). One open row per barcode; resolved when the product is added at the station. A lot-and-expiry label alone never opens one | supply_chain |
| `not_on_any_contract` | A product with no contract line is arrived or pulled (for example the hospital-owned DECA cable pack). One open row per product | supply_chain |

Real labels carry two separate barcodes. The item barcode is GS1 with only (01) GTIN, or HIBC primary `+LIC product UoM check` (Code 39). The lot barcode is GS1 with only (17) expiry and (10) lot, or HIBC secondary `+$$3 YYMMDD lot link check`. The station takes the item scan, waits, and attaches the next lot scan to it. The HIBC link character must match the item's check character. If no lot label is scanned, the tech picks the lot from a list (pull: lots on hand, earliest expiry first; return: lots still out on the case) or types it on arrival.

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

- Real products from physical packages (digits read from photos; confirm with a scan). Prices and par levels are placeholders.
  - Terumo Pinnacle Introducer Sheath 8 Fr, REF RSS802, GTIN 00389701007496, lot 0001681425, expiry 2028-11-01 (GS1)
  - Terumo Pinnacle Introducer Sheath 11 Fr, REF RSS106, GTIN 00389701007762, lot 0001476667, expiry 2028-07-01 (GS1)
  - Cardiva Vascade MVP closure, catalog 800-612C, HIBC item `+M729800612C0`, lot G612C260420B, expiry 2028-04-09 (Code 39 HIBC)
  - NuVision NAV Ultrasound Catheter, REF FG12081, GTIN 10846835026559, lot 31982149L, expiry 2027-07-02 (GS1). Vendor shown as "NuVision (manufacturer to confirm)"
  - Pack EP Lab SMALL DECA Cable, CB3410CT: hospital-owned (`products.ku_owned = 1`), vendor "In-house", on no contract. Sterile date 2026-09-16 as read from the pack. Lot SPD-PLACEHOLDER-1 stands in for the unread load number
- Vendor reps: Terry (Terumo), Pat (Cardiva), Nico (NuVision), plus placeholder reps for Vendors C to G
- Placeholder Vendors C to G for all other stock. The expiring-soon lot (EXPIRINGSOON1) and the expired lot (EXPIRED-SHELF) sit on the placeholder Vendor C mapping catheter
- One EP case: 6 items pulled (sheath x2, closure, ablation catheter, mapping catheter x2); 1 returned, so 5 used
- One Cath 1 case left open two days ago (case open past timeout) and one unknown barcode `+H999DEMO01` (placeholder) to demonstrate the exceptions
