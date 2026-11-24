import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanStation } from "@/components/ScanStation";
import { isPreviewLab, loadCaseOpenOptions } from "@/lib/case-open";
import { DEMO_LABELS } from "@/lib/demo-labels";
import { givenName } from "@/lib/display-name";
import { isScanDebugEnabled, isSoftTriggerEnabled } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import { loadStationBoard, stationModesForRole } from "@/lib/station";

export const dynamic = "force-dynamic";

export default async function StationPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role === "vendor_rep") {
    redirect("/vendor/check-in");
  }

  const modes = user ? stationModesForRole(user.role) : [];
  if (!user || !user.active || modes.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">Check out</h1>
        <p className="text-lg text-amber-900">
          Pick <strong>Alex</strong> to check out or return, or{" "}
          <strong>Terry Terumo</strong>, <strong>Pat Cardiva</strong> or{" "}
          <strong>Nico NuVision</strong> to check in.
        </p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const parsedCase = sp.case ? Number(sp.case) : null;
  const caseId = parsedCase && Number.isFinite(parsedCase) ? parsedCase : null;
  const [board, caseOptions, softTrigger, scanDebug] = await Promise.all([
    loadStationBoard(caseId),
    loadCaseOpenOptions(user.id),
    isSoftTriggerEnabled(),
    isScanDebugEnabled(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Check out</h1>
          <p className="text-sm text-slate-600">
            {givenName(user.name)} · {user.role}. Scan a tag to check it out (KU
            pays now). Scan a checked-out tag again to return it. Barcode is the
            fallback for untagged items.
          </p>
        </div>
        <Link href="/demo/labels" className="text-sm font-semibold underline">
          Large barcode sheet
        </Link>
      </div>
      <ScanStation
        allowedModes={modes}
        showCasePanel
        allowAddProduct={false}
        caseRow={
          board.caseRow
            ? {
                id: board.caseRow.id,
                status: board.caseRow.status,
                departmentName: board.caseRow.departmentName,
                roomName: board.caseRow.roomName,
                procedureTypeName: board.caseRow.procedureTypeName,
                preview: isPreviewLab(board.caseRow.departmentPhase),
              }
            : null
        }
        caseOptions={caseOptions}
        reconciliation={board.reconciliation}
        lines={board.lines}
        stock={board.stock}
        vendors={board.vendors}
        simulate={DEMO_LABELS.filter(
          (label) => label.id !== "unknown" || user.role === "tech",
        )}
        softTrigger={softTrigger}
        scanDebug={scanDebug}
      />
    </div>
  );
}
