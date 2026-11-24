import type { VendorReturnRow } from "@/lib/vendor-portal";

export function ReturnsTable({
  rows,
  showVendor = false,
}: {
  rows: VendorReturnRow[];
  showVendor?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="text-slate-600">
            <th className="py-2 pr-3 font-medium">Returned</th>
            {showVendor ? <th className="py-2 pr-3 font-medium">Vendor</th> : null}
            <th className="py-2 pr-3 font-medium">Product</th>
            <th className="py-2 pr-3 font-medium">Lot</th>
            <th className="py-2 pr-3 font-medium">Case date</th>
            <th className="py-2 pr-3 font-medium">Room</th>
            <th className="py-2 font-medium">Procedure</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.caseId}-${row.productId}-${row.lot}-${row.returnedAt}`}
              className="border-t border-slate-100"
            >
              <td className="py-2 pr-3">{row.returnedAt}</td>
              {showVendor ? <td className="py-2 pr-3">{row.vendorName}</td> : null}
              <td className="py-2 pr-3">
                {row.description}
                <span className="mt-0.5 block font-mono text-xs text-slate-500">
                  {row.catalogNumber}
                </span>
              </td>
              <td className="py-2 pr-3 font-mono text-xs">{row.lot ?? "—"}</td>
              <td className="py-2 pr-3">{row.caseDate}</td>
              <td className="py-2 pr-3">{row.roomName ?? "—"}</td>
              <td className="py-2">{row.procedureTypeName ?? "—"}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={showVendor ? 7 : 6}
                className="py-3 text-slate-500"
              >
                No returns.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
