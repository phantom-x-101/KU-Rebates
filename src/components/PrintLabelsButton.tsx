"use client";

export function PrintLabelsButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-pc-teal px-4 py-2 font-semibold text-white"
    >
      Print labels
    </button>
  );
}
