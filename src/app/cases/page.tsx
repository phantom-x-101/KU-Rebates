import Link from "next/link";
import { isPreviewLab } from "@/lib/case-open";
import { CASE_ROLES, listCases } from "@/lib/cases";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const user = await getCurrentUser();
  if (
    !user ||
    !CASE_ROLES.includes(user.role as (typeof CASE_ROLES)[number])
  ) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Cases</h1>
        <p className="text-sm text-amber-800">
          Cases are available to <strong>tech</strong>,{" "}
          <strong>supply_chain</strong>, and <strong>admin</strong>.
        </p>
      </div>
    );
  }

  const rows = await listCases();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open a case, pull items, then return what comes back. No
            patient identifiers.
          </p>
        </div>
        <Link
          href="/cases/new"
          className="rounded bg-pc-teal px-3 py-1.5 text-sm font-medium text-white"
        >
          Open case
        </Link>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-slate-600">
            <th className="py-2 pr-3 font-medium">ID</th>
            <th className="py-2 pr-3 font-medium">Lab · Room</th>
            <th className="py-2 pr-3 font-medium">Procedure</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 font-medium">Opened</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-slate-200">
              <td className="py-2 pr-3">
                <Link href={`/cases/${c.id}`} className="underline">
                  {c.id}
                </Link>
              </td>
              <td className="py-2 pr-3 font-medium">
                {c.departmentName} · {c.roomName ?? "no room"}
                {isPreviewLab(c.departmentPhase) ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold uppercase text-amber-900">
                    preview
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-3">{c.procedureTypeName ?? "—"}</td>
              <td className="py-2 pr-3 font-medium">{c.status}</td>
              <td className="py-2 font-mono text-xs">{c.openedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
