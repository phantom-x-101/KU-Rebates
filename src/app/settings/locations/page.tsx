import { SettingsForm } from "@/components/SettingsForm";
import { SettingsNav } from "@/components/SettingsNav";
import { createLocationAction } from "@/app/settings/actions";
import { listDepartments, listStorageLocations } from "@/lib/settings";

export default async function LocationsSettingsPage() {
  const [rows, departments] = await Promise.all([
    listStorageLocations(),
    listDepartments(),
  ]);

  return (
    <>
      <SettingsNav current="/settings/locations" />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Add storage location</h2>
          <SettingsForm action={createLocationAction} submitLabel="Add location">
            <label className="block text-sm">
              <span className="text-slate-600">Name</span>
              <input
                name="name"
                required
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Department (optional)</span>
              <select
                name="departmentId"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue=""
              >
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Storage type</span>
              <select
                name="storageType"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                defaultValue="shelf"
              >
                <option value="shelf">shelf</option>
                <option value="room">room</option>
                <option value="central">central</option>
                <option value="controlled">controlled</option>
              </select>
            </label>
          </SettingsForm>
        </section>
        <section>
          <h2 className="text-lg font-medium">Locations</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Department</th>
                <th className="py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-200">
                  <td className="py-2 pr-3">{r.id}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">{r.departmentName ?? "—"}</td>
                  <td className="py-2">{r.storageType ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
