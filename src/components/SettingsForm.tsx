"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/settings/actions";

const initial: ActionState = { ok: false, message: "" };

export function SettingsForm({
  action,
  children,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-3">
      {children}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      {state.message ? (
        <p
          className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
