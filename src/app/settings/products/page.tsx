import { SettingsForm } from "@/components/SettingsForm";
import { SettingsNav } from "@/components/SettingsNav";
import { createProductAction } from "@/app/settings/actions";
import { listProducts, listVendors } from "@/lib/settings";

export default async function ProductsSettingsPage() {
  const [rows, vendorRows] = await Promise.all([listProducts(), listVendors()]);

  return (
    <>
      <SettingsNav current="/settings/products" />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Add product</h2>
          <SettingsForm action={createProductAction} submitLabel="Add product">
            <label className="block text-sm">
              <span className="text-slate-600">Vendor</span>
              <select
                name="vendorId"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue=""
              >
                <option value="" disabled>
                  Select vendor
                </option>
                {vendorRows.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Catalog number</span>
              <input
                name="catalogNumber"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Description</span>
              <input
                name="description"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Category (optional)</span>
              <input
                name="category"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">GTIN (optional)</span>
              <input
                name="gtin"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">HIBC (optional)</span>
              <input
                name="hibc"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">
                Catalog identifier (optional; defaults to catalog number)
              </span>
              <input
                name="catalogIdentifier"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
              />
            </label>
          </SettingsForm>
        </section>
        <section>
          <h2 className="text-lg font-medium">Products</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600">
                  <th className="py-2 pr-3 font-medium">ID</th>
                  <th className="py-2 pr-3 font-medium">Vendor</th>
                  <th className="py-2 pr-3 font-medium">Catalog</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 font-medium">Identifiers</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-slate-200 align-top">
                    <td className="py-2 pr-3">{p.id}</td>
                    <td className="py-2 pr-3">{p.vendorName}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{p.catalogNumber}</td>
                    <td className="py-2 pr-3">{p.description}</td>
                    <td className="py-2 font-mono text-xs text-slate-700">
                      {p.identifiers
                        .map((i) => `${i.idType}:${i.value}`)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
