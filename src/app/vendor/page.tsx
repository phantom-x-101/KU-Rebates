import { Suspense } from "react";
import { VendorPortal } from "@/components/VendorPortal";
import { listArrivalLocations } from "@/lib/arrival";
import { getCurrentUser } from "@/lib/session";
import {
  canAccessVendorPortal,
  getVendorName,
  listVendorExpiryAlerts,
  listVendorStock,
  listVendorUsage,
  requireVendorRepScope,
} from "@/lib/vendor-portal";

export const dynamic = "force-dynamic";

export default async function VendorPortalPage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    fromDate?: string;
    toDate?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="text-sm text-amber-800">
        Pick a vendor_rep user in the header to open the portal.
      </p>
    );
  }
  if (!canAccessVendorPortal(user)) {
    return (
      <p className="text-sm text-amber-800">
        Vendor portal is limited to <code>vendor_rep</code> users linked to a
        vendor. Your role is <strong>{user.role}</strong>.
      </p>
    );
  }

  const { vendorId } = requireVendorRepScope(user);
  const sp = await searchParams;
  const locationId = sp.locationId ?? "";
  const fromDate = sp.fromDate ?? "";
  const toDate = sp.toDate ?? "";

  const [vendorName, stock, usage, alerts, locations] = await Promise.all([
    getVendorName(vendorId),
    listVendorStock(vendorId, {
      locationId: locationId ? Number(locationId) : undefined,
    }),
    listVendorUsage(vendorId, {
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    listVendorExpiryAlerts(vendorId),
    listArrivalLocations(),
  ]);

  return (
    <Suspense fallback={<p className="text-sm">Loading portal…</p>}>
      <VendorPortal
        vendorName={vendorName ?? `Vendor #${vendorId}`}
        stock={stock}
        usage={usage}
        alerts={alerts}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        filters={{ locationId, fromDate, toDate }}
      />
    </Suspense>
  );
}
