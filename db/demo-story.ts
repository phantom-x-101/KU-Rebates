/**
 * Closed-case history using only the real products.
 * Dates are offsets from today UTC. Four use events are stamped today so Taken today is populated.
 */
import type { AppDb } from "../src/db";
import {
  cases,
  contractLineProducts,
  contractLines,
  contracts,
  exceptions,
  stockEvents,
} from "../src/db/schema";
import { audit } from "../src/lib/audit";
import { UNMAPPED_ACTION } from "../src/lib/exceptions";
import { CASE_TIMEOUT_ACTION } from "../src/lib/reconcile";
import {
  CARDIVA_DEMO_SHEATH,
  CARDIVA_VASCADE,
  DECA_CABLE_PACK,
  DEMO_EXPIRED_LOT,
  DEMO_SOON_LOT,
  NUVISION_DEMO_CATH,
  NUVISION_NAV,
  TERUMO_11FR,
  TERUMO_8FR,
} from "../src/lib/real-products";

export const SEED_UNMAPPED_BARCODE = "UNKNOWN-DEMO-99";

const ALEX = 1;
const TERRY = 5;
const PAT = 6;
const NICO = 7;

function addDays(iso: string, days: number) {
  const base = Date.parse(`${iso}T00:00:00Z`);
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

function stamp(day: string, hour: number, minute: number) {
  return `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export async function seedDemoStory(
  db: AppDb,
  opts: { todayIso: string; soonExpiryIso: string },
) {
  const { todayIso, soonExpiryIso } = opts;

  await db.insert(contracts).values([
    {
      id: 1,
      vendorId: 1,
      name: "Terumo placeholder terms (demo)",
      externalId: "DEMO-1",
      contractType: "direct",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      periodType: "quarter",
      countBasis: "used",
      allLinesRequired: 1,
      forecastMethod: "run_rate",
      status: "active",
    },
    {
      id: 2,
      vendorId: 2,
      name: "Cardiva placeholder terms (demo)",
      externalId: "DEMO-2",
      contractType: "direct",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      periodType: "quarter",
      countBasis: "used",
      allLinesRequired: 1,
      forecastMethod: "run_rate",
      status: "active",
    },
    {
      id: 3,
      vendorId: 3,
      name: "NuVision placeholder terms (demo)",
      externalId: "DEMO-3",
      contractType: "direct",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      periodType: "quarter",
      countBasis: "used",
      allLinesRequired: 1,
      forecastMethod: "run_rate",
      status: "active",
    },
  ]);
  await db.insert(contractLines).values([
    {
      id: 1,
      contractId: 1,
      name: "Placeholder unit commitment (demo)",
      metric: "units",
      requiredQty: 100,
    },
    {
      id: 2,
      contractId: 2,
      name: "Placeholder unit commitment (demo)",
      metric: "units",
      requiredQty: 100,
    },
    {
      id: 3,
      contractId: 3,
      name: "Placeholder unit commitment (demo)",
      metric: "units",
      requiredQty: 100,
    },
  ]);
  await db.insert(contractLineProducts).values([
    { contractLineId: 1, productId: TERUMO_8FR.id, countMultiplier: 1 },
    { contractLineId: 1, productId: TERUMO_11FR.id, countMultiplier: 1 },
    { contractLineId: 2, productId: CARDIVA_VASCADE.id, countMultiplier: 1 },
    { contractLineId: 2, productId: CARDIVA_DEMO_SHEATH.id, countMultiplier: 1 },
    { contractLineId: 3, productId: NUVISION_NAV.id, countMultiplier: 1 },
    { contractLineId: 3, productId: NUVISION_DEMO_CATH.id, countMultiplier: 1 },
  ]);

  await db.insert(stockEvents).values([
    {
      eventType: "arrived",
      productId: TERUMO_8FR.id,
      locationId: 1,
      lot: TERUMO_8FR.lot,
      expiry: TERUMO_8FR.expiry,
      qty: 3,
      byUserId: TERRY,
      at: stamp(addDays(todayIso, -20), 9, 0),
    },
    {
      eventType: "arrived",
      productId: NUVISION_NAV.id,
      locationId: 1,
      lot: NUVISION_NAV.lot,
      expiry: NUVISION_NAV.expiry,
      qty: 1,
      byUserId: NICO,
      at: stamp(addDays(todayIso, -20), 9, 10),
    },
    {
      eventType: "arrived",
      productId: DECA_CABLE_PACK.id,
      locationId: 1,
      lot: DECA_CABLE_PACK.lot,
      expiry: DECA_CABLE_PACK.expiry,
      qty: 1,
      byUserId: 2,
      at: stamp(addDays(todayIso, -20), 9, 20),
    },
    {
      eventType: "arrived",
      productId: TERUMO_11FR.id,
      locationId: 1,
      lot: DEMO_EXPIRED_LOT,
      expiry: "2020-01-01",
      qty: 1,
      byUserId: TERRY,
      at: stamp(addDays(todayIso, -18), 10, 0),
    },
    {
      eventType: "arrived",
      productId: CARDIVA_VASCADE.id,
      locationId: 1,
      lot: DEMO_SOON_LOT,
      expiry: soonExpiryIso,
      qty: 1,
      byUserId: PAT,
      at: stamp(addDays(todayIso, -18), 10, 5),
    },
  ]);

  type CaseSpec = {
    id: number;
    daysAgo: number;
    roomId: number;
    procedureTypeId: number;
    uses: { productId: number; lot: string; expiry: string }[];
    returns?: { productId: number; lot: string; expiry: string }[];
  };

  const casespecs: CaseSpec[] = [
    {
      id: 1,
      daysAgo: 14,
      roomId: 1,
      procedureTypeId: 1,
      uses: [
        { productId: TERUMO_8FR.id, lot: TERUMO_8FR.lot, expiry: TERUMO_8FR.expiry },
        {
          productId: CARDIVA_VASCADE.id,
          lot: CARDIVA_VASCADE.lot,
          expiry: CARDIVA_VASCADE.expiry,
        },
      ],
      returns: [
        {
          productId: CARDIVA_VASCADE.id,
          lot: CARDIVA_VASCADE.lot,
          expiry: CARDIVA_VASCADE.expiry,
        },
      ],
    },
    {
      id: 2,
      daysAgo: 12,
      roomId: 2,
      procedureTypeId: 2,
      uses: [
        { productId: TERUMO_8FR.id, lot: TERUMO_8FR.lot, expiry: TERUMO_8FR.expiry },
        {
          productId: CARDIVA_DEMO_SHEATH.id,
          lot: CARDIVA_DEMO_SHEATH.lot,
          expiry: CARDIVA_DEMO_SHEATH.expiry,
        },
      ],
    },
    {
      id: 3,
      daysAgo: 10,
      roomId: 1,
      procedureTypeId: 1,
      uses: [
        { productId: TERUMO_8FR.id, lot: TERUMO_8FR.lot, expiry: TERUMO_8FR.expiry },
        { productId: NUVISION_NAV.id, lot: NUVISION_NAV.lot, expiry: NUVISION_NAV.expiry },
      ],
    },
    {
      id: 4,
      daysAgo: 8,
      roomId: 2,
      procedureTypeId: 3,
      uses: [
        {
          productId: CARDIVA_VASCADE.id,
          lot: CARDIVA_VASCADE.lot,
          expiry: CARDIVA_VASCADE.expiry,
        },
        {
          productId: DECA_CABLE_PACK.id,
          lot: DECA_CABLE_PACK.lot,
          expiry: DECA_CABLE_PACK.expiry,
        },
        {
          productId: NUVISION_DEMO_CATH.id,
          lot: NUVISION_DEMO_CATH.lot,
          expiry: NUVISION_DEMO_CATH.expiry,
        },
      ],
    },
    {
      id: 5,
      daysAgo: 5,
      roomId: 1,
      procedureTypeId: 1,
      uses: [
        { productId: TERUMO_8FR.id, lot: TERUMO_8FR.lot, expiry: TERUMO_8FR.expiry },
        {
          productId: CARDIVA_DEMO_SHEATH.id,
          lot: CARDIVA_DEMO_SHEATH.lot,
          expiry: CARDIVA_DEMO_SHEATH.expiry,
        },
        {
          productId: NUVISION_DEMO_CATH.id,
          lot: NUVISION_DEMO_CATH.lot,
          expiry: NUVISION_DEMO_CATH.expiry,
        },
      ],
    },
    {
      id: 6,
      daysAgo: 2,
      roomId: 2,
      procedureTypeId: 2,
      uses: [
        { productId: TERUMO_8FR.id, lot: TERUMO_8FR.lot, expiry: TERUMO_8FR.expiry },
        {
          productId: CARDIVA_DEMO_SHEATH.id,
          lot: CARDIVA_DEMO_SHEATH.lot,
          expiry: CARDIVA_DEMO_SHEATH.expiry,
        },
        {
          productId: NUVISION_DEMO_CATH.id,
          lot: NUVISION_DEMO_CATH.lot,
          expiry: NUVISION_DEMO_CATH.expiry,
        },
      ],
    },
  ];

  for (const spec of casespecs) {
    const day = addDays(todayIso, -spec.daysAgo);
    const openedAt = stamp(day, 8, 0);
    const closedAt = stamp(day, 10, 30);
    await db.insert(cases).values({
      id: spec.id,
      departmentId: 1,
      roomId: spec.roomId,
      procedureTypeId: spec.procedureTypeId,
      openedAt,
      closedAt,
      openedBy: ALEX,
      status: "closed",
    });
    for (const [index, item] of spec.uses.entries()) {
      await db.insert(stockEvents).values({
        eventType: "pulled",
        productId: item.productId,
        locationId: 1,
        caseId: spec.id,
        lot: item.lot,
        expiry: item.expiry,
        qty: 1,
        byUserId: ALEX,
        at: stamp(day, 8, 15 + index),
      });
    }
    for (const [index, item] of (spec.returns ?? []).entries()) {
      await db.insert(stockEvents).values({
        eventType: "returned",
        productId: item.productId,
        locationId: 1,
        caseId: spec.id,
        lot: item.lot,
        expiry: item.expiry,
        qty: 1,
        byUserId: ALEX,
        at: stamp(day, 10, 5 + index),
      });
    }
  }

  const staleOpened = stamp(addDays(todayIso, -2), 7, 30);
  await db.insert(cases).values({
    id: 7,
    departmentId: 1,
    roomId: 1,
    procedureTypeId: 1,
    openedAt: staleOpened,
    closedAt: null,
    openedBy: ALEX,
    status: "open",
  });
  const todayUses = [
    CARDIVA_DEMO_SHEATH,
    CARDIVA_DEMO_SHEATH,
    NUVISION_DEMO_CATH,
    NUVISION_DEMO_CATH,
  ];
  for (const [index, item] of todayUses.entries()) {
    await db.insert(stockEvents).values({
      eventType: "pulled",
      productId: item.id,
      locationId: 1,
      caseId: 7,
      lot: item.lot,
      expiry: item.expiry,
      qty: 1,
      byUserId: ALEX,
      at: stamp(todayIso, 9, index),
    });
  }
  const [timeout] = await db
    .insert(exceptions)
    .values({
      sourceContainer: 2,
      type: "case_open_past_timeout",
      productId: null,
      status: "open",
      ownerUserId: 2,
    })
    .returning();
  await audit(
    {
      userId: 2,
      container: 2,
      entity: "exceptions",
      entityId: timeout.id,
      action: CASE_TIMEOUT_ACTION,
      detail: `case=${7}`,
    },
    db,
  );

  const [unmapped] = await db
    .insert(exceptions)
    .values({
      sourceContainer: 1,
      type: "bill_only_unmapped",
      productId: null,
      status: "open",
      ownerUserId: null,
    })
    .returning();
  await audit(
    {
      userId: TERRY,
      container: 1,
      entity: "exceptions",
      entityId: unmapped.id,
      action: UNMAPPED_ACTION,
      detail: `via=arrival vendor=1 barcode=${SEED_UNMAPPED_BARCODE}`,
    },
    db,
  );

  await audit(
    {
      userId: 2,
      container: 1,
      entity: "cases",
      action: "seed_story",
      detail: "Six closed EP cases, one open timeout case, demo SKUs, and four uses today",
    },
    db,
  );
}
