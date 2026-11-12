import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseCloseoutPanel } from "@/components/CaseCloseoutPanel";
import { CasePullForm } from "@/components/CasePullForm";
import { listArrivalLocations } from "@/lib/arrival";
import { isPreviewLab } from "@/lib/case-open";
import {
  CASE_ROLES,
  getCase,
  listCasePullLines,
} from "@/lib/cases";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (
    !user ||
    !CASE_ROLES.includes(user.role as (typeof CASE_ROLES)[number])
  ) {
    return (
      <p className="text-sm text-amber-800">
        Pick a tech, supply_chain, or admin user to work cases.
      </p>
    );
  }

  const { id: idRaw } = await params;
  const caseId = Number(idRaw);
  if (!Number.isFinite(caseId)) notFound();

  const caseRow = await getCase(caseId);
  if (!caseRow) notFound();

  const [lines, locations] = await Promise.all([
    listCasePullLines(caseId),
    listArrivalLocations(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cases" className="text-sm underline">
          ← Cases
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {[caseRow.departmentName, caseRow.roomName, caseRow.procedureTypeName]
            .filter(Boolean)
            .join(" · ")}
          {isPreviewLab(caseRow.departmentPhase) ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-semibold uppercase text-amber-900">
              preview
            </span>
          ) : null}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Case #{caseRow.id} · <span className="font-medium">{caseRow.status}</span>
        </p>
        <p className="text-xs text-slate-500">
          No patient identifiers on this case.
        </p>
      </div>

      {caseRow.status === "open" ? (
        <CasePullForm
          caseId={caseId}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        />
      ) : null}

      <CaseCloseoutPanel
        caseId={caseId}
        status={caseRow.status}
        lines={lines}
      />
    </div>
  );
}
