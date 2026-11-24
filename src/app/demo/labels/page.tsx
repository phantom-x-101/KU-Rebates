import { resetDemoAction } from "@/app/demo/actions";
import { PrintLabelsButton } from "@/components/PrintLabelsButton";
import {
  DEMO_LABELS,
  labelSymbolText,
  type DemoLabel,
} from "@/lib/demo-labels";
import { barcodeDataUrl } from "@/lib/render-barcode";

export const dynamic = "force-dynamic";

export default async function LabelSheetPage() {
  const labels: DemoLabel[] = [...DEMO_LABELS];

  const images = await Promise.all(
    labels.map(async (label) => {
      const symbol = labelSymbolText(label.barcode);
      return {
        ...label,
        symbol,
        src: await barcodeDataUrl(symbol, label.symbology),
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
            Terry Terumo uses the Terumo labels, Pat Cardiva the HIBC pair,
            Nico NuVision the NuVision pair. Scan the item first, then its lot
            label. Alex uses the DECA pack (already on the shelf, not on any
            contract). The unknown code is rejected on check-in and creates no
            stock event.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrintLabelsButton />
          <form action={resetDemoAction}>
            <button
              type="submit"
              className="rounded-lg bg-pc-teal px-4 py-2 font-semibold text-white"
            >
              Reset Data
            </button>
          </form>
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
