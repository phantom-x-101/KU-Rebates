import { SettingsForm } from "@/components/SettingsForm";
import { SettingsNav } from "@/components/SettingsNav";
import { createExpiryRuleAction } from "@/app/settings/actions";
import { listExpiryRules, listVendors } from "@/lib/settings";

export default async function ExpiryRulesSettingsPage() {
  const [rows, vendors] = await Promise.all([listExpiryRules(), listVendors()]);

  return (
    <>
      <SettingsNav current="/settings/expiry-rules" />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Add expiry rule</h2>
          <SettingsForm
            action={createExpiryRuleAction}
            submitLabel="Add expiry rule"
          >
            <label className="block text-sm">
              <span className="text-slate-600">Vendor (optional = global)</span>
              <select
                name="vendorId"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue=""
              >
                <option value="">Global default</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Days before expiry to alert</span>
              <input
                name="daysBefore"
                type="number"
                min={1}
                defaultValue={60}
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="vendorPaysExpired"
                defaultChecked
                value="1"
              />
              <span className="text-slate-700">Vendor pays for expired stock</span>
            </label>
          </SettingsForm>
        </section>
        <section>
          <h2 className="text-lg font-medium">Expiry rules</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Vendor</th>
                <th className="py-2 pr-3 font-medium">Days before</th>
                <th className="py-2 font-medium">Vendor pays</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-200">
                  <td className="py-2 pr-3">{r.id}</td>
                  <td className="py-2 pr-3">{r.vendorName ?? "Global"}</td>
                  <td className="py-2 pr-3">{r.daysBefore}</td>
                  <td className="py-2">{r.vendorPaysExpired ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
