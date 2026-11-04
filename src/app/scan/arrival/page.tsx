import Link from "next/link";
import { ScanArrivalForm } from "@/components/ScanArrivalForm";
import { listArrivalLocations } from "@/lib/arrival";
import { canManageSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import type { UserRole } from "@/db/schema";

export const dynamic = "force-dynamic";

const SCAN_ROLES: UserRole[] = ["tech", "supply_chain", "admin"];

export default async function ScanArrivalPage() {
  const user = await getCurrentUser();
  if (!user || !SCAN_ROLES.includes(user.role as UserRole)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Scan on arrival</h1>
        <p className="text-sm text-amber-800">
          Scan on arrival is available to <strong>tech</strong>,{" "}
          <strong>supply_chain</strong>, and <strong>admin</strong>. Pick one of
          those users in the header.
        </p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  const locations = await listArrivalLocations();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scan on arrival</h1>
        <p className="mt-1 text-sm text-slate-600">
          Log stock as it reaches the shelf or room. No patient data. Nothing is
          written back to Epic, GE, or Workday.
        </p>
      </div>
      {locations.length === 0 ? (
        <p className="text-sm text-amber-800">
          No storage locations yet.{" "}
          {canManageSettings(user) ? (
            <Link href="/settings/locations" className="underline">
              Add a location in Settings
            </Link>
          ) : (
            "Ask supply_chain or admin to add a location."
          )}
        </p>
      ) : (
        <ScanArrivalForm
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          canAddProduct={canManageSettings(user)}
        />
      )}
    </div>
  );
}
