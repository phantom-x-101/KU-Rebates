import Link from "next/link";
import { canAccessDashboard, getSupplyChainDashboard } from "@/lib/dashboard";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!canAccessDashboard(user)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Supply chain dashboard</h1>
        <p className="text-sm text-amber-800">
          Dashboard is for <strong>supply_chain</strong> and{" "}
          <strong>admin</strong>. Pick Sam or Ada in the header.
        </p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  const dash = await getSupplyChainDashboard();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Supply chain dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Snapshot for <strong>{dash.asOf}</strong> (UTC day). Suggestions
          only. This prototype does not place orders.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Taken today"
          value={String(dash.takenTodayQty)}
          hint={`${dash.takenToday.length} pull event(s)`}
        />
        <Stat
          label="Open exceptions"
          value={String(dash.openExceptions.length)}
          hint="open + in_review"
          href="/exceptions"
        />
        <Stat
          label="Expiring ≤30 days"
          value={String(dash.expiringIn30Days.length)}
          hint="lots still on hand"
          href="/stock?flag=expiring_soon"
        />
        <Stat
          label="Low stock"
          value={String(dash.lowStock.length)}
          hint="below par"
          href="/reorder"
        />
      </div>

      <Section title="Items taken today" empty="No pulls recorded today.">
        {dash.takenToday.length > 0 ? (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Catalog</th>
                <th className="py-2 pr-3 font-medium">Vendor</th>
                <th className="py-2 pr-3 font-medium">Lot</th>
                <th className="py-2 pr-3 font-medium">Qty</th>
                <th className="py-2 font-medium">Room</th>
              </tr>
            </thead>
            <tbody>
              {dash.takenToday.map((r) => (
                <tr
                  key={r.stockEventId}
                  className="border-b border-slate-200"
                >
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.at.slice(11, 19) || r.at}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.catalogNumber}
                  </td>
                  <td className="py-2 pr-3">{r.vendorName}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.lot ?? "—"}
                  </td>
                  <td className="py-2 pr-3 font-semibold">{r.qty}</td>
                  <td className="py-2">{r.roomName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      <Section
        title="Open exceptions"
        empty="No open exceptions."
        moreHref="/exceptions"
      >
        {dash.openExceptions.length > 0 ? (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Container</th>
                <th className="py-2 pr-3 font-medium">Catalog</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {dash.openExceptions.map((e) => (
                <tr key={e.id} className="border-b border-slate-200">
                  <td className="py-2 pr-3">{e.id}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{e.type}</td>
                  <td className="py-2 pr-3">{e.sourceContainer}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {e.catalogNumber ?? "—"}
                  </td>
                  <td className="py-2">{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      <Section
        title="Expiring in 30 days"
        empty="No lots expiring within 30 days."
        moreHref="/stock"
      >
        {dash.expiringIn30Days.length > 0 ? (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">Catalog</th>
                <th className="py-2 pr-3 font-medium">Lot</th>
                <th className="py-2 pr-3 font-medium">Expiry</th>
                <th className="py-2 pr-3 font-medium">Days</th>
                <th className="py-2 font-medium">On hand</th>
              </tr>
            </thead>
            <tbody>
              {dash.expiringIn30Days.map((r) => (
                <tr
                  key={`${r.productId}-${r.lot}-${r.expiry}`}
                  className="border-b border-slate-200"
                >
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.catalogNumber}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.lot ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-amber-900">{r.expiry ?? "—"}</td>
                  <td className="py-2 pr-3">{r.daysUntilExpiry ?? "—"}</td>
                  <td className="py-2 font-semibold">{r.onHand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      <Section
        title="Low stock"
        empty="No products below par."
        moreHref="/reorder"
      >
        {dash.lowStock.length > 0 ? (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">Catalog</th>
                <th className="py-2 pr-3 font-medium">Dept</th>
                <th className="py-2 pr-3 font-medium">On hand</th>
                <th className="py-2 pr-3 font-medium">Par</th>
                <th className="py-2 font-medium">Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {dash.lowStock.map((r) => (
                <tr
                  key={`${r.productId}-${r.departmentName}`}
                  className="border-b border-slate-200"
                >
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.catalogNumber}
                  </td>
                  <td className="py-2 pr-3">{r.departmentName}</td>
                  <td className="py-2 pr-3 font-semibold text-amber-900">
                    {r.onHand}
                  </td>
                  <td className="py-2 pr-3">{r.parLevel ?? "—"}</td>
                  <td className="py-2 text-xs text-slate-600">{r.suggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      {inner}
    </div>
  );
}

function Section({
  title,
  empty,
  moreHref,
  children,
}: {
  title: string;
  empty: string;
  moreHref?: string;
  children: React.ReactNode;
}) {
  const hasTable = Boolean(children);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        {moreHref ? (
          <Link href={moreHref} className="text-xs underline text-slate-600">
            View all
          </Link>
        ) : null}
      </div>
      {hasTable ? (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white px-3">
          {children}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}
