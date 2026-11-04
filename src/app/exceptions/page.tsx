import { Suspense } from "react";
import Link from "next/link";
import { ExceptionQueue } from "@/components/ExceptionQueue";
import {
  EXCEPTION_QUEUE_ROLES,
  listAssignableOwners,
  listExceptions,
} from "@/lib/exceptions";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; container?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (
    !user ||
    !EXCEPTION_QUEUE_ROLES.includes(
      user.role as (typeof EXCEPTION_QUEUE_ROLES)[number],
    )
  ) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Exception queue</h1>
        <p className="text-sm text-amber-800">
          Exception queue is limited to <strong>supply_chain</strong> and{" "}
          <strong>admin</strong>.
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

  const [rows, owners] = await Promise.all([
    listExceptions({
      type: type || undefined,
      sourceContainer: container ? Number(container) : undefined,
      status: status || undefined,
    }),
    listAssignableOwners(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exception queue</h1>
        <p className="mt-1 text-sm text-slate-600">
          Filter by type and source container. Assign an owner and resolve with a
          note — every resolve writes the audit log.
        </p>
      </div>
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
