"use client";

import { useActionState } from "react";
import { noteReorderAction, type ReorderActionState } from "@/app/reorder/actions";

const initial: ReorderActionState = { ok: false, message: "" };

export function ReorderButton({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState(noteReorderAction, initial);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-pc-teal px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "…" : "Reorder"}
      </button>
      {state.message ? (
        <span
          className={`mt-1 block text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
