"use client";

import { useTransition } from "react";
import { selectUser } from "@/app/actions";
import type { User } from "@/db/schema";

export function UserPicker({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: number | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-600">Acting as</span>
      <select
        className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
        disabled={pending || users.length === 0}
        value={currentUserId ?? ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          if (!id) return;
          startTransition(() => {
            void selectUser(id);
          });
        }}
      >
        <option value="" disabled>
          Select user
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.role})
          </option>
        ))}
      </select>
    </label>
  );
}
