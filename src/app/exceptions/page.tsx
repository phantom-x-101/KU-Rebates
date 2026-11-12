import { Suspense } from "react";
import Link from "next/link";
import { ExceptionQueue } from "@/components/ExceptionQueue";
import {
  canAccessExceptionQueue,
  listAssignableOwners,
  listExceptions,
} from "@/lib/exceptions";
import { getCurrentUser } from "@/lib/session";
import { ensureExpiredOnShelfExceptions, listStockView } from "@/lib/stock-view";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; container?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!canAccessExceptionQueue(user)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Exception queue</h1>
        <p className="text-sm text-amber-800">
          Exception queue is limited to <strong>supply chain</strong>,{" "}
          <strong>category owner</strong>, and <strong>admin</strong>.
        </p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const type = sp.type ?? "";
  const container = sp.container ?? "";
  const status = sp.status ?? "open";

  await ensureExpiredOnShelfExceptions(user!.id);

  const [rows, owners, stock] = await Promise.all([
    listExceptions({
      type: type || undefined,
      sourceContainer: container ? Number(container) : undefined,
      status: status || undefined,
    }),
    listAssignableOwners(),
    listStockView({}),
  ]);
  const lotWatch = stock.filter(
    (row) => row.flag === "expiring_soon" || row.flag === "expired",
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exception queue</h1>
        <p className="mt-1 text-sm text-slate-600">
          Case gaps, wasted items, and expired lots are rows below. Expiring lots
          are listed with them. Assign an owner and resolve with a note.
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Expiring and expired lots</h2>
        {lotWatch.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No expiring or expired lots on hand.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {lotWatch.map((row) => (
              <li key={`${row.productId}-${row.lot}-${row.expiry}`}>
                <span
                  className={
                    row.flag === "expired"
                      ? "font-semibold text-red-800"
                      : "font-semibold text-amber-800"
                  }
                >
                  {row.flag === "expired"
                    ? "Expired"
                    : row.daysUntilExpiry != null && row.daysUntilExpiry <= 30
                      ? `Expiring within 30 days (${row.daysUntilExpiry}d)`
                      : "Expiring soon"}
                </span>
                {" · "}
                {row.vendorName} {row.catalogNumber} · lot {row.lot} · exp {row.expiry} ·
                on hand {row.onHand}
                {row.flag === "expired" ? " · rep pays" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <ExceptionQueue
          rows={rows}
          owners={owners}
          filters={{ type, container, status }}
        />
      </Suspense>
    </div>
  );
}
