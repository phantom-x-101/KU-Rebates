import { formatTag } from "@/lib/tag";

/** Invented EPC-style IDs for the printable tag sheet. Demo data. */
export const DEMO_TAG_COUNT = 12;

export function demoTagEpc(n: number) {
  return `E200${String(n).padStart(8, "0")}`;
}

export function demoTagDisplay(n: number) {
  return formatTag(demoTagEpc(n));
}

export type DemoTag = {
  n: number;
  epc: string;
  display: string;
  note: string;
};

export const DEMO_TAGS: DemoTag[] = Array.from({ length: DEMO_TAG_COUNT }, (_, i) => {
  const n = i + 1;
  return {
    n,
    epc: demoTagEpc(n),
    display: demoTagDisplay(n),
    note:
      n <= 3
        ? "Terry Terumo checks this in against RSS802."
        : n === 12
          ? "Unknown tag — creates an Unknown tag exception."
          : "Demo tag. Invented ID, not a real EPC.",
  };
});
