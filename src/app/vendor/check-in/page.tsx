import { CheckInStation } from "@/components/CheckInStation";
import { getCurrentUser } from "@/lib/session";
import { isScanDebugEnabled, isSoftTriggerEnabled } from "@/lib/settings";
import { listVendorUnits } from "@/lib/units";
import {
  canAccessVendorPortal,
  getVendorName,
  requireVendorRepScope,
} from "@/lib/vendor-portal";

export const dynamic = "force-dynamic";

export default async function VendorCheckInPage() {
  const user = await getCurrentUser();
  if (!user || !canAccessVendorPortal(user)) {
    return (
      <p className="text-lg text-amber-800">
        Pick <strong>Terry Terumo</strong>, <strong>Pat Cardiva</strong> or{" "}
        <strong>Nico NuVision</strong> to check in.
      </p>
    );
  }

  const { vendorId } = requireVendorRepScope(user);
  const [vendorName, linked, softTrigger, scanDebug] = await Promise.all([
    getVendorName(vendorId),
    listVendorUnits(vendorId),
    isSoftTriggerEnabled(),
    isScanDebugEnabled(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Check in</h1>
        <p className="mt-1 text-base text-slate-700">
          Scan the product barcode, then the tag. One tag links to one unit.
        </p>
      </div>
      <CheckInStation
        vendorName={vendorName ?? "Vendor"}
        linked={linked}
        softTrigger={softTrigger}
        scanDebug={scanDebug}
      />
    </div>
  );
}
