import { UsageTable } from "@/components/UsageTable";
import { getCurrentUser } from "@/lib/session";
import { listVendorUsage } from "@/lib/vendor-portal";

export const dynamic = "force-dynamic";

const READ_ROLES = ["supply_chain", "category_owner", "admin"] as const;

export default async function UsagePage() {
  const user = await getCurrentUser();
  if (
    !user ||
    !READ_ROLES.includes(user.role as (typeof READ_ROLES)[number])
  ) {
    return (
      <p className="text-sm text-amber-800">
        Usage is a read-only view for supply chain, category owner, and admin.
      </p>
    );
  }

  const rows = await listVendorUsage(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="mt-1 text-sm text-slate-600">
          Each use is the billable event (KU pays now). Returns are netted out.
          Hospital-owned items show as not on any contract.
        </p>
      </div>
      <UsageTable rows={rows} showVendor />
    </div>
  );
}
