import Link from "next/link";
import { PrintLabelsButton } from "@/components/PrintLabelsButton";
import { DEMO_LABELS, expiringLotBarcode, type DemoLabel } from "@/lib/demo-labels";
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
    labels.map(async (label) => ({
      ...label,
      src: await barcodeDataUrl(label.barcode),
    })),
  );

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          header, footer { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="no-print">
        <h1 className="text-3xl font-bold">Demo labels</h1>
        <p className="mt-1 max-w-2xl text-slate-700">
          Code 128 symbols of the barcode strings the station reads. Placeholder
          GTINs are not valid GS1 check digits, so this sheet is not strict
          GS1-128. A keyboard-wedge scanner still types the text under each code.
        </p>
        <div className="mt-3 flex gap-3">
          <PrintLabelsButton />
          <Link href="/demo" className="self-center text-sm font-semibold underline">
            Back to the demo script
          </Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {images.map((label) => (
          <article
            key={label.id}
            className="break-inside-avoid rounded-xl border border-slate-300 bg-white p-4 text-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={label.src} alt="" className="mx-auto h-24 w-full object-contain" />
            <h2 className="mt-2 text-lg font-bold">{label.title}</h2>
            <p className="text-sm text-slate-800">{label.caption}</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-600">{label.barcode}</p>
            <p className="mt-1 text-xs text-slate-500">{label.note}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
