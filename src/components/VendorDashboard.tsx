import type { VendorDashboard } from "@/lib/vendor-dashboard";

export function VendorDashboardView({
  vendorName,
  dashboard,
}: {
  vendorName: string;
  dashboard: VendorDashboard;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {vendorName} dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Your products only. Usage is KU pays at the use scan, net of
          returns.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RankCard title="Most used" rows={dashboard.mostUsed} />
        <RankCard title="Least used" rows={dashboard.leastUsed} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Usage over time</h2>
        {dashboard.usageOverTime.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No uses yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.usageOverTime.map((row) => (
              <li key={row.day} className="flex justify-between">
                <span>{row.day}</span>
                <span className="font-semibold tabular-nums">{row.qty}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">On hand against par</h2>
        <table className="mt-2 min-w-full text-left text-sm">
          <thead>
            <tr className="text-slate-600">
              <th className="py-1 pr-3 font-medium">Product</th>
              <th className="py-1 pr-3 font-medium">On hand</th>
              <th className="py-1 font-medium">Par</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.onHandVsPar.map((row) => (
              <tr key={row.productId} className="border-t border-slate-100">
                <td className="py-2 pr-3">
                  {row.description}
                  <span className="mt-0.5 block font-mono text-xs text-slate-500">
                    {row.catalogNumber}
                  </span>
                </td>
                <td className="py-2 pr-3 font-semibold tabular-nums">
                  {row.onHand}
                  {row.belowPar ? (
                    <span className="ml-2 text-xs font-semibold text-amber-800">
                      below par
                    </span>
                  ) : null}
                </td>
                <td className="py-2 tabular-nums">{row.parLevel ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Expiring soon</h2>
        {dashboard.expiringSoon.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No expiring or expired lots.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.expiringSoon.map((row) => (
              <li key={`${row.productId}-${row.lot}-${row.expiry}`}>
                <span
                  className={
                    row.flag === "expired"
                      ? "font-semibold text-red-800"
                      : "font-semibold text-amber-800"
                  }
                >
                  {row.flag === "expired" ? "Expired" : "Expiring soon"}
                </span>
                {" · "}
                {row.description} · lot {row.lot} · exp {row.expiry} · on hand{" "}
                {row.onHand}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RankCard({
  title,
  rows,
}: {
  title: string;
  rows: VendorDashboard["mostUsed"];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No products yet.</p>
      ) : (
        <ol className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.productId} className="flex justify-between gap-3">
              <span>
                {row.description}
                <span className="mt-0.5 block font-mono text-xs text-slate-500">
                  {row.catalogNumber}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{row.qty}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
