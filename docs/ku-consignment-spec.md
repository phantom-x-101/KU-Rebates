# Consignment (Container 1): workflow spec

Vendor-led prototype. Numbers, par levels and invented lots marked as demo data are not real KU data.

## Purpose

Show, without an on-site audit, what stock is on KU's shelf, what the tech used or returned for each case, and what is expired, expiring or below par. KU's own steps stay as they are. Pycube writes nothing back to Epic, GE or Workday.

## How the flow works now

1. **Vendor check-in.** On Check in, scan the product barcode first (item, then lot and expiry), then scan the RFID tag. Any real tag ID (8–40 alphanumeric) is accepted. One tag links to one unit. A tag already in use, another vendor's product, or hospital-owned stock is rejected. Writes `units` plus `stock_events.arrived` and `audit_log`.
2. **Tech check-out.** Alex opens a case and scans a linked tag to **Check out**, or uses Scan barcode for untagged items. That scan is the billable event ("KU pays now"). The data model still stores `stock_events.event_type = pulled`.
3. **Tech return.** Scanning a checked-out tag again, or the untagged RETURN barcode path, puts the unit back in stock. The return nets that unit out of usage, dashboards, and KU-pays counts. No vendor confirmation.
4. **Close.** Alex closes the case. There is no waste or opened-item flow yet.
5. **Unknown or expired tag.** An unknown tag opens an **Unknown tag** exception. An expired unit blocks checkout and opens **Expired unit**.

The hospital-owned DECA cable pack is already on the shelf. Nobody checks it in. Checking it out flags **Not on any contract**.

## Roles

- **vendor_rep** (Terry Terumo, Pat Cardiva, Nico NuVision): check in tagged units; inventory of individual units plus editable par and expiry-alert days; dashboard (most/least used, usage over time, on hand vs par, expiring soon); read-only returns; own exception queue. Isolation is enforced in the data layer.
- **tech** (Alex): check out and return only. Open and close cases. Cannot check in.
- **supply_chain** (Sam): read-only inventory, usage, returns and exceptions across the three vendors.

Pycube never places an order.

## Stock

On hand is derived: arrived + returned − pulled − expired. For lots that have tagged units, on hand = units with status `in_stock`. The DECA pack is seeded on hand (untagged).

## Exceptions this build creates

| Type | When | Who sees it |
|---|---|---|
| `expired_on_shelf` | On-hand lot past expiry | Vendor (own products) and KU |
| `expiring_soon` | On-hand lot within the vendor's alert days | Vendor (own products) and KU |
| `low_stock` | Product on-hand below par | Vendor (own products) and KU |
| `bill_only_unmapped` | Unknown barcode on check-in | The checking-in vendor and KU |
| `rejected_arrival` | Check-in of another vendor's or hospital-owned item | The checking-in vendor and KU |
| `not_on_any_contract` | A used item has no contract line (DECA pack) | KU only |
| `case_open_past_timeout` | A case still open after the timeout | KU only |
| `unknown_tag` | Tag ID not in `units` | KU |
| `expired_unit` | Checkout of a tagged unit past expiry | Vendor (own product) and KU |

## Two-barcode labels

Real labels carry two barcodes. Item is GS1 (01) GTIN or HIBC primary. Lot is GS1 (17)+(10) or HIBC secondary `+$$3`. The station waits for the lot scan after the item scan.

## Out of scope

Contracts, tiers, rebates, ordering, integrations, patient information, and waste/opened-item flow.

## Demo seed (invented lots, quantities and dates are demo data)

- Terumo: RSS802 8 Fr, RSS106 11 Fr. Rep: Terry Terumo. RSS802 is below par. RSS106 has lot `DEMO-EXPIRED`.
- Cardiva: Vascade MVP 800-612C. Rep: Pat Cardiva. Lot `DEMO-SOON` expires within 30 days.
- NuVision: NAV Ultrasound Catheter FG12081. Rep: Nico NuVision.
- Hospital-owned: Pack EP Lab SMALL DECA Cable CB3410CT. No vendor, no rep, not on any contract, seeded on hand.
- Users: Alex (tech), Sam (supply chain), Terry Terumo, Pat Cardiva, Nico NuVision.
- Six closed EP cases over two weeks plus one open timeout case, four uses today (demo SKUs), and one unknown-scan exception for Terry Terumo.
- Placeholder Cardiva and NuVision SKUs so most/least used are different products.
- Fake tag IDs `E200-0000-0001` through `E200-0000-0012` (demo data). Terry checks in three Terumo units; Alex checks one out by tag.
