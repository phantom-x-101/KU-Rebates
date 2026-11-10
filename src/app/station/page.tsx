import Link from "next/link";
import { ScanStation } from "@/components/ScanStation";
import { DEMO_LABELS, expiringLotBarcode } from "@/lib/demo-labels";
import { CASE_ROLES } from "@/lib/cases";
import { getCurrentUser } from "@/lib/session";
import { loadStationBoard } from "@/lib/station";

export const dynamic = "force-dynamic";

export default async function StationPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const user = await getCurrentUser();
  if (
    !user ||
    !user.active ||
    !CASE_ROLES.includes(user.role as (typeof CASE_ROLES)[number])
  ) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">Scan station</h1>
        <p className="text-lg text-amber-900">
          Pick <strong>Alex Tech</strong> in the header. The station is for tech,
          supply chain, and admin.
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
  const board = await loadStationBoard(caseId);
  const expiring = board.stock.find((row) => row.lot === "EXPIRINGSOON1");
  const simulate = expiring?.expiry
    ? [
        ...DEMO_LABELS,
        {
          id: "expiring",
          title: "Expiring Terumo lot (not on this case)",
          caption: `EXPIRINGSOON1 · exp ${expiring.expiry}`,
          barcode: expiringLotBarcode(expiring.expiry),
          symbology: "gs1-128" as const,
          note: "On the shelf from seed. Pull it only if you mean to.",
        },
      ]
    : DEMO_LABELS;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scan station</h1>
        <p className="text-sm text-slate-600">
          {user.name} · {user.role}. Arrive stock, pull it for an EP case, then
          use, waste, or return. The check is taken = used + wasted + returned.
        </p>
      </div>
      <ScanStation
        caseRow={
          board.caseRow
            ? {
                id: board.caseRow.id,
                status: board.caseRow.status,
                departmentName: board.caseRow.departmentName,
                roomName: board.caseRow.roomName,
                procedureTypeName: board.caseRow.procedureTypeName,
              }
            : null
        }
        reconciliation={board.reconciliation}
        lines={board.lines}
        stock={board.stock}
        vendors={board.vendors}
        simulate={simulate}
      />
    </div>
  );
}
