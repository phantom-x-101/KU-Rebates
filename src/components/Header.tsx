import Link from "next/link";
import { UserPicker } from "@/components/UserPicker";
import { canManageSettings } from "@/lib/settings";
import type { User } from "@/db/schema";

export function Header({
  users,
  currentUser,
}: {
  users: User[];
  currentUser: User | null;
}) {
  return (
    <header className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <Link href="/" className="text-lg font-semibold text-slate-900">
              KU Rebate
            </Link>
            <p className="text-xs text-slate-500">Consignment prototype (Phase 3)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentUser &&
            ["tech", "supply_chain", "admin"].includes(currentUser.role) ? (
              <Link
                href="/scan/arrival"
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 hover:bg-slate-100"
              >
                Scan arrival
              </Link>
            ) : null}
            {canManageSettings(currentUser) ? (
              <Link
                href="/settings"
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 hover:bg-slate-100"
              >
                Settings
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm text-slate-700">
            Role:{" "}
            <span className="font-semibold text-slate-900">
              {currentUser?.role ?? "none"}
            </span>
          </div>
          <UserPicker users={users} currentUserId={currentUser?.id ?? null} />
        </div>
      </div>
    </header>
  );
}
