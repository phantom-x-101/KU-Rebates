import { SettingsForm } from "@/components/SettingsForm";
import { SettingsNav } from "@/components/SettingsNav";
import { createVendorAction } from "@/app/settings/actions";
import { listVendors } from "@/lib/settings";

export default async function VendorsSettingsPage() {
  const rows = await listVendors();

  return (
    <>
      <SettingsNav current="/settings/vendors" />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Add vendor</h2>
          <SettingsForm action={createVendorAction} submitLabel="Add vendor">
            <label className="block text-sm">
              <span className="text-slate-600">Name</span>
              <input
                name="name"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">External ID (optional)</span>
              <input
                name="externalId"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
          </SettingsForm>
        </section>
        <section>
          <h2 className="text-lg font-medium">Vendors</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 font-medium">External ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-b border-slate-200">
                  <td className="py-2 pr-3">{v.id}</td>
                  <td className="py-2 pr-3">{v.name}</td>
                  <td className="py-2">{v.externalId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
