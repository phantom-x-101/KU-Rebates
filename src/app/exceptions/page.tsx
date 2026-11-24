import Link from "next/link";
import { ExceptionQueue } from "@/components/ExceptionQueue";
import {
  canAccessExceptionQueue,
  listAssignableOwners,
  listExceptions,
} from "@/lib/exceptions";
import { flagCasesOpenPastTimeout } from "@/lib/reconcile";
import { getCurrentUser } from "@/lib/session";
import {
  ensureExpiredOnShelfExceptions,
  ensureExpiringSoonExceptions,
  ensureLowStockExceptions,
  listStockView,
} from "@/lib/stock-view";
import { requireVendorRepScope } from "@/lib/vendor-portal";

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
          Exception queue is limited to supply chain, category owner, admin, and
          vendor reps (own queue only).
        </p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  const vendorScope =
    user!.role === "vendor_rep" ? requireVendorRepScope(user).vendorId : null;

  const sp = await searchParams;
  const type = sp.type ?? "";
  const container = sp.container ?? "";
  const status = sp.status ?? "open";

  const now = new Date();
  const stock = await listStockView(
    vendorScope != null ? { vendorId: vendorScope } : {},
    now,
  );
  await ensureExpiredOnShelfExceptions(user!.id, now, undefined, stock);
  await ensureExpiringSoonExceptions(user!.id, now, undefined, stock);
  await ensureLowStockExceptions(user!.id, now, undefined, stock);
  if (vendorScope == null) {
    await flagCasesOpenPastTimeout(user!.id, now);
  }

  const [rows, owners] = await Promise.all([
    listExceptions({
      type: type || undefined,
      sourceContainer: container ? Number(container) : undefined,
      status: status || undefined,
      vendorId: vendorScope ?? undefined,
    }),
    listAssignableOwners(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exception queue</h1>
        <p className="mt-1 text-sm text-slate-600">
          {vendorScope != null
            ? "Your queue: expired on shelf, expiring soon, low stock, and rejected or unknown arrivals."
            : "Expired lots, expiring soon, low stock, unknown scans, and items not on any contract (including the hospital-owned DECA pack)."}
        </p>
      </div>
      <ExceptionQueue
        rows={rows}
        owners={owners}
        filters={{ type, container, status }}
        readOnly={vendorScope != null}
      />
    </div>
  );
}
