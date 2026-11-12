"use client";

import { useTransition } from "react";
import { selectUser } from "@/app/actions";
import type { User } from "@/db/schema";
import { givenName } from "@/lib/display-name";

const ROLE_LABEL: Record<string, string> = {
  tech: "Tech",
  supply_chain: "Supply chain",
  category_owner: "Category owner",
  admin: "Admin",
  vendor_rep: "Vendor rep",
};

function designation(role: string) {
  return ROLE_LABEL[role] ?? role;
}

export function UserPicker({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const current = users.find((user) => user.id === currentUserId) ?? null;

  return (
    <label className="relative block">
      <span className="sr-only">Acting as</span>
      <span
        className={`flex items-center gap-2 rounded-md border border-[var(--pc-line)] bg-white px-3 py-1.5 text-right leading-tight text-[#16323c] ${
          pending ? "opacity-60" : ""
        }`}
      >
        <span>
          <span className="block text-sm font-bold">
            {current ? givenName(current.name) : "Select user"}
          </span>
          <span className="block text-sm font-bold">
            {current ? designation(current.role) : "Choose a role"}
          </span>
        </span>
        <span aria-hidden className="text-xs text-slate-500">
          ▾
        </span>
      </span>
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
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
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {givenName(user.name)} — {designation(user.role)}
          </option>
        ))}
      </select>
    </label>
  );
}
