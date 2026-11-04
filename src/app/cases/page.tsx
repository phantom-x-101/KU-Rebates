import Link from "next/link";
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
            Open a case, scan pulls, then close out used / wasted / returned. No
            patient identifiers.
          </p>
        </div>
        <Link
          href="/cases/new"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Open case
        </Link>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-slate-600">
            <th className="py-2 pr-3 font-medium">ID</th>
            <th className="py-2 pr-3 font-medium">Department</th>
            <th className="py-2 pr-3 font-medium">Room</th>
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
              <td className="py-2 pr-3">{c.departmentName}</td>
              <td className="py-2 pr-3">{c.roomName ?? "—"}</td>
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
