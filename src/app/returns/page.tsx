import { ReturnsTable } from "@/components/ReturnsTable";
import { getCurrentUser } from "@/lib/session";
import { listVendorReturns } from "@/lib/vendor-portal";

export const dynamic = "force-dynamic";

const READ_ROLES = ["supply_chain", "category_owner", "admin"] as const;

export default async function ReturnsPage() {
  const user = await getCurrentUser();
  if (
    !user ||
    !READ_ROLES.includes(user.role as (typeof READ_ROLES)[number])
  ) {
    return (
      <p className="text-sm text-amber-800">
        Returns are a read-only view for supply chain, category owner, and admin.
      </p>
    );
  }

  const rows = await listVendorReturns(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <p className="mt-1 text-sm text-slate-600">
          Items KU returned to the shelf, across the three vendors.
        </p>
      </div>
      <ReturnsTable rows={rows} showVendor />
    </div>
  );
}
