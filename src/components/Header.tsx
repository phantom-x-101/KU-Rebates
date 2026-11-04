import { UserPicker } from "@/components/UserPicker";
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
        <div>
          <p className="text-lg font-semibold text-slate-900">KU Rebate</p>
          <p className="text-xs text-slate-500">Consignment prototype (Phase 1)</p>
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
