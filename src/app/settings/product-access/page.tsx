import { SettingsForm } from "@/components/SettingsForm";
import { SettingsNav } from "@/components/SettingsNav";
import { upsertProductAccessAction } from "@/app/settings/actions";
import {
  listDepartments,
  listProductAccess,
  listProducts,
  listStorageLocations,
} from "@/lib/settings";

export default async function ProductAccessSettingsPage() {
  const [rows, products, departments, locations] = await Promise.all([
    listProductAccess(),
    listProducts(),
    listDepartments(),
    listStorageLocations(),
  ]);

  return (
    <>
      <SettingsNav current="/settings/product-access" />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Set product access</h2>
          <p className="text-sm text-slate-600">
            Assign access mode, location, and par level per product and department.
          </p>
          <SettingsForm
            action={upsertProductAccessAction}
            submitLabel="Save access"
          >
            <label className="block text-sm">
              <span className="text-slate-600">Product</span>
              <select
                name="productId"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue=""
              >
                <option value="" disabled>
                  Select product
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.vendorName} — {p.catalogNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Department</span>
              <select
                name="departmentId"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue=""
              >
                <option value="" disabled>
                  Select department
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Access mode</span>
              <select
                name="accessMode"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue="on_shelf"
              >
                <option value="on_shelf">on_shelf</option>
                <option value="brought_in_for_case">brought_in_for_case</option>
                <option value="not_kept_in_stock">not_kept_in_stock</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Location (optional)</span>
              <select
                name="locationId"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue=""
              >
                <option value="">None</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Par level (optional)</span>
              <input
                name="parLevel"
                type="number"
                min={0}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
          </SettingsForm>
        </section>
        <section>
          <h2 className="text-lg font-medium">Product access list</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600">
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 pr-3 font-medium">Department</th>
                  <th className="py-2 pr-3 font-medium">Mode</th>
                  <th className="py-2 pr-3 font-medium">Location</th>
                  <th className="py-2 font-medium">Par</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.productId}-${r.departmentId}`}
                    className="border-b border-slate-200"
                  >
                    <td className="py-2 pr-3">
                      {r.vendorName} {r.catalogNumber}
                    </td>
                    <td className="py-2 pr-3">{r.departmentName}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.accessMode}</td>
                    <td className="py-2 pr-3">{r.locationName ?? "—"}</td>
                    <td className="py-2">{r.parLevel ?? "—"}</td>
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
