import { VendorDashboardView } from "@/components/VendorDashboard";
import { getCurrentUser } from "@/lib/session";
import { getVendorDashboard } from "@/lib/vendor-dashboard";
import {
  canAccessVendorPortal,
  getVendorName,
  requireVendorRepScope,
} from "@/lib/vendor-portal";

export const dynamic = "force-dynamic";

export default async function VendorPortalPage() {
  const user = await getCurrentUser();
  if (!user || !canAccessVendorPortal(user)) {
    return (
      <p className="text-sm text-amber-800">
        Pick <strong>Terry Terumo</strong>, <strong>Pat Cardiva</strong> or{" "}
        <strong>Nico NuVision</strong> in the header to open your vendor
        dashboard.
      </p>
    );
  }

  const { vendorId } = requireVendorRepScope(user);
  const [vendorName, dashboard] = await Promise.all([
    getVendorName(vendorId),
    getVendorDashboard(vendorId),
  ]);

  return (
    <VendorDashboardView
      vendorName={vendorName ?? `Vendor #${vendorId}`}
      dashboard={dashboard}
    />
  );
}
