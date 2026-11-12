import Link from "next/link";
import { resetDemoAction } from "@/app/demo/actions";
import { givenName } from "@/lib/display-name";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "1",
    title: "Arrive",
    detail: "Scan five deliveries onto the shelf.",
  },
  {
    n: "2",
    title: "Pull",
    detail: "Open an EP case and scan those items out.",
  },
  {
    n: "3",
    title: "Return",
    detail: "Scan back what comes back to the shelf.",
  },
  {
    n: "4",
    title: "Check",
    detail: "Taken must equal returned.",
  },
  {
    n: "5",
    title: "Problems",
    detail: "Leave one item out. The gap lands in Exceptions.",
  },
  {
    n: "6",
    title: "Vendor view",
    detail: "As Terry Terumo Rep, only Terumo stock is visible.",
  },
  {
    n: "7",
    title: "Reorder",
    detail: "Low stock shows a suggestion. This prototype does not place the order.",
  },
];

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const resetMs = sp.reset ? Number(sp.reset) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Simulate Flow</h1>
          <p className="mt-1 max-w-2xl text-slate-700">
            One pass, about five minutes. Start as <strong>Alex</strong> or{" "}
            <strong>Ada</strong>. Print labels if you have a scanner.
          </p>
          <p className="mt-2">
            <Link href="/demo/labels" className="font-semibold underline">
              Print the barcode sheet
            </Link>
          </p>
        </div>
        <Link
          href="/station"
          className="rounded-xl bg-pc-teal px-8 py-4 text-lg font-semibold text-white"
        >
          Scan station
        </Link>
      </div>

      <form action={resetDemoAction} className="rounded-xl border border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Reset demo data</h2>
            <p className="mt-1 text-sm text-slate-600">
              Puts the shelf, cases, and exceptions back to the clean seed. Your
              selected user stays signed in.
              {user ? ` Acting as ${givenName(user.name)}.` : " Pick a user first."}
            </p>
          </div>
          <button
            type="submit"
            disabled={!user}
            className="rounded-lg bg-pc-teal px-4 py-2 font-semibold text-white disabled:opacity-40"
          >
            Reset demo
          </button>
        </div>
      </form>

      {resetMs != null && Number.isFinite(resetMs) ? (
        <p className="rounded-lg bg-emerald-700 px-4 py-3 text-lg font-semibold text-white">
          Demo data restored in {resetMs} ms.
        </p>
      ) : null}

      <ol className="space-y-3">
        {STEPS.map((step) => (
          <li key={step.n} className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-lg font-bold">
              {step.n}. {step.title}
            </p>
            <p className="mt-1 text-slate-700">{step.detail}</p>
          </li>
        ))}
      </ol>

    </div>
  );
}
