import { stockOnHand } from "@/lib/stock";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  let rows: Awaited<ReturnType<typeof stockOnHand>> = [];
  let error: string | null = null;
  try {
    rows = await stockOnHand();
  } catch (e) {
    error = e instanceof Error ? e.message : "Database not ready";
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">KU Rebate prototype</h1>
        <p className="mt-1 max-w-2xl text-slate-600">
          Phase 3 adds scan on arrival. Pick a tech, supply_chain, or admin user, then
          open Scan arrival. Settings remain available to admin and supply_chain.
        </p>
        {user ? (
          <p className="mt-3 text-sm text-slate-700">
            Signed in as <strong>{user.name}</strong> with role <strong>{user.role}</strong>.
          </p>
        ) : (
          <p className="mt-3 text-sm text-amber-800">
            No user selected. Run <code className="rounded bg-slate-200 px-1">npm run db:seed</code>{" "}
            then choose a user above.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium">Stock on hand (derived)</h2>
        <p className="text-sm text-slate-600">
          arrived + returned − pulled − expired from <code>stock_events</code>.
        </p>
        {error ? (
          <p className="mt-2 text-sm text-red-700">{error}. Seed the database first.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600">
                  <th className="py-2 pr-4 font-medium">Product ID</th>
                  <th className="py-2 pr-4 font-medium">Location</th>
                  <th className="py-2 pr-4 font-medium">Lot</th>
                  <th className="py-2 pr-4 font-medium">Expiry</th>
                  <th className="py-2 font-medium">On hand</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.productId}-${r.locationId}-${r.lot}-${r.expiry}`}
                    className="border-b border-slate-200"
                  >
                    <td className="py-2 pr-4">{r.productId}</td>
                    <td className="py-2 pr-4">{r.locationId ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.lot ?? "—"}</td>
                    <td className="py-2 pr-4">{r.expiry ?? "—"}</td>
                    <td className="py-2 font-semibold">{r.onHand}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
