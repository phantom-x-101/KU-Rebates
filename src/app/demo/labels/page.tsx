import Link from "next/link";
import { resetDemoAction } from "@/app/demo/actions";
import { PrintLabelsButton } from "@/components/PrintLabelsButton";
import {
  DEMO_LABELS,
  expiringLotBarcode,
  labelSymbolText,
  type DemoLabel,
} from "@/lib/demo-labels";
import { barcodeDataUrl } from "@/lib/render-barcode";
import { listStockView } from "@/lib/stock-view";

export const dynamic = "force-dynamic";

export default async function LabelSheetPage() {
  let labels: DemoLabel[] = [...DEMO_LABELS];
  try {
    const stock = await listStockView({});
    const expiring = stock.find((row) => row.lot === "EXPIRINGSOON1");
    if (expiring?.expiry) {
      labels = [
        ...labels,
        {
          id: "expiring",
          title: "Expiring Terumo lot — not on the seeded case",
          caption: `RSS802 · lot EXPIRINGSOON1 · exp ${expiring.expiry}`,
          barcode: expiringLotBarcode(expiring.expiry),
          symbology: "gs1-128",
          note: "Already on the shelf. Use it to show an item that is not on your new case.",
        },
      ];
    }
  } catch {
    // Sheet still prints the static labels if the database is not seeded.
  }

  const images = await Promise.all(
    labels.map(async (label) => {
      const symbol = labelSymbolText(label.barcode);
      return {
        ...label,
        symbol,
        src: await barcodeDataUrl(symbol),
      };
    }),
  );

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          header, footer, aside { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Demo labels</h1>
          <p className="mt-1 max-w-2xl text-slate-700">
            One large code per label. Hold the scanner a few inches from the bars.
            The line under each code is exactly what a scan types into the station.
            In-stock items can be arrived, pulled, and returned. The sheet also
            has an expired code, an unknown code, and one item with no contract.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrintLabelsButton />
          <form action={resetDemoAction}>
            <button
              type="submit"
              className="rounded-lg bg-pc-teal px-4 py-2 font-semibold text-white"
            >
              Reset demo
            </button>
          </form>
          <Link href="/demo" className="text-sm font-semibold underline">
            Simulate Flow
          </Link>
        </div>
      </div>
      <div className="space-y-6">
        {images.map((label) => (
          <article
            key={label.id}
            className="break-inside-avoid rounded-xl border border-slate-300 bg-white px-6 py-5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={label.src} alt="" className="demo-barcode" />
            <h2 className="mt-3 text-2xl font-bold">{label.title}</h2>
            <p className="text-lg text-slate-800">{label.caption}</p>
            <p className="mt-2 break-all font-mono text-lg tracking-wide text-[#16323c]">
              {label.symbol}
            </p>
            <p className="mt-1 text-sm text-slate-500">{label.note}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
