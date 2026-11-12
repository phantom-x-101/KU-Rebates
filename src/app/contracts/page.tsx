import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts, vendors } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user || !["category_owner", "admin"].includes(user.role)) {
    return (
      <p className="text-sm text-amber-800">
        Contracts are for the category owner and admin.
      </p>
    );
  }

  const rows = await getDb()
    .select({
      id: contracts.id,
      name: contracts.name,
      vendorName: vendors.name,
      status: contracts.status,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
    })
    .from(contracts)
    .innerJoin(vendors, eq(contracts.vendorId, vendors.id));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Contracts on file. This consignment slice does not edit them.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          No contracts are loaded in this demo.
        </p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Vendor</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Dates</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-3">{row.name}</td>
                <td className="py-2 pr-3">{row.vendorName}</td>
                <td className="py-2 pr-3">{row.status}</td>
                <td className="py-2">
                  {row.startDate} – {row.endDate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
