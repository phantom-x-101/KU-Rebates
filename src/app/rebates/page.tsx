import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contractTiers, contracts, vendors } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RebatesPage() {
  const user = await getCurrentUser();
  if (!user || !["category_owner", "admin"].includes(user.role)) {
    return (
      <p className="text-sm text-amber-800">
        Rebates are for the category owner and admin.
      </p>
    );
  }

  const rows = await getDb()
    .select({
      id: contractTiers.id,
      contractName: contracts.name,
      vendorName: vendors.name,
      tierLevel: contractTiers.tierLevel,
      rebateType: contractTiers.rebateType,
      rebateValue: contractTiers.rebateValue,
    })
    .from(contractTiers)
    .innerJoin(contracts, eq(contractTiers.contractId, contracts.id))
    .innerJoin(vendors, eq(contracts.vendorId, vendors.id));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rebates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Rebate tiers on file. This consignment slice does not calculate payouts.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          No rebate tiers are loaded in this demo.
        </p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="py-2 pr-3 font-medium">Contract</th>
              <th className="py-2 pr-3 font-medium">Vendor</th>
              <th className="py-2 pr-3 font-medium">Tier</th>
              <th className="py-2 font-medium">Rebate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-3">{row.contractName}</td>
                <td className="py-2 pr-3">{row.vendorName}</td>
                <td className="py-2 pr-3">{row.tierLevel}</td>
                <td className="py-2">
                  {row.rebateType === "percent"
                    ? `${row.rebateValue}%`
                    : row.rebateValue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
