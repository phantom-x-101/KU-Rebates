import Link from "next/link";
import { resetDemoAction } from "@/app/demo/actions";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "1",
    title: "Arrive",
    detail: "On the scan station, mode ARRIVE. Scan the five item labels. On-hand goes up.",
    href: "/station",
    link: "Open the scan station",
  },
  {
    n: "2",
    title: "Pull",
    detail: "Open an EP case, switch to PULL, and scan the same items off the shelf.",
    href: "/station",
    link: "Scan station",
  },
  {
    n: "3",
    title: "Use",
    detail: "Switch to USE for four items and RETURN for one. WASTE is there if you open a package.",
    href: "/station",
    link: "Scan station",
  },
  {
    n: "4",
    title: "Check",
    detail: "The tally turns into a green tick when taken = used + wasted + returned. Close case to record it.",
    href: "/station",
    link: "Scan station",
  },
  {
    n: "5",
    title: "Problems",
    detail: "Leave one pulled item out and close the case. The gap is red and lands in the exception queue with wasted and expiring lots.",
    href: "/exceptions",
    link: "Exception queue",
  },
  {
    n: "6",
    title: "Vendor view",
    detail: "Switch the user picker to Terry Terumo Rep. The portal shows only Terumo stock, usage, and expiry.",
    href: "/vendor",
    link: "Vendor portal",
  },
  {
    n: "7",
    title: "Reorder",
    detail: "Switch back to Sam Supply or Admin Ada. Stock shows par versus on-hand and a suggestion. There is no order button.",
    href: "/stock",
    link: "Stock and reorder",
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Run the demo</h1>
        <p className="mt-1 max-w-2xl text-slate-700">
          One pass, about five minutes. Start as <strong>Alex Tech</strong> or{" "}
          <strong>Admin Ada</strong>. Print labels if you have a scanner.
        </p>
        <p className="mt-2">
          <Link href="/demo/labels" className="font-semibold underline">
            Print the barcode sheet
          </Link>
        </p>
      </div>

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
            <Link href={step.href} className="mt-2 inline-block text-sm font-semibold underline">
              {step.link}
            </Link>
          </li>
        ))}
      </ol>

      <form action={resetDemoAction} className="rounded-xl border border-slate-300 bg-white p-4">
        <h2 className="text-lg font-bold">Reset demo data</h2>
        <p className="mt-1 text-sm text-slate-600">
          Puts the shelf, cases, and exceptions back to the clean seed. Your
          selected user stays signed in.
          {user ? ` Acting as ${user.name}.` : " Pick a user first."}
        </p>
        <button
          type="submit"
          disabled={!user}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          Reset demo data
        </button>
      </form>
    </div>
  );
}
