import { SettingsNav } from "@/components/SettingsNav";
import { listRecentAudit } from "@/lib/settings";

export default async function AuditSettingsPage() {
  const rows = await listRecentAudit(40);

  return (
    <>
      <SettingsNav current="/settings/audit" />
      <section>
        <h2 className="text-lg font-medium">Audit log</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recent writes (who, when, entity, action). Read-only.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">At</th>
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">Entity</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-200 align-top">
                  <td className="py-2 pr-3">{r.id}</td>
                  <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs">
                    {r.at}
                  </td>
                  <td className="py-2 pr-3">{r.userName ?? r.userId ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {r.entity}
                    {r.entityId != null ? ` #${r.entityId}` : ""}
                  </td>
                  <td className="py-2 pr-3">{r.action}</td>
                  <td className="py-2 font-mono text-xs text-slate-700">
                    {r.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
