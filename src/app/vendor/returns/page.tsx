import { ReturnsTable } from "@/components/ReturnsTable";
import { getCurrentUser } from "@/lib/session";
import {
  canAccessVendorPortal,
  getVendorName,
  listVendorReturns,
  requireVendorRepScope,
} from "@/lib/vendor-portal";

export const dynamic = "force-dynamic";

export default async function VendorReturnsPage() {
  const user = await getCurrentUser();
  if (!canAccessVendorPortal(user)) {
    return (
      <p className="text-sm text-amber-800">
        Returns are limited to the signed-in vendor rep.
      </p>
    );
  }
  const { vendorId } = requireVendorRepScope(user);
  const [vendorName, rows] = await Promise.all([
    getVendorName(vendorId),
    listVendorReturns(vendorId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Returns — {vendorName ?? "your vendor"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Items KU returned to the shelf. Read-only; no confirmation is needed.
        </p>
      </div>
      <ReturnsTable rows={rows} />
    </div>
  );
}
