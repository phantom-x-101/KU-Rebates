import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { canManageSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!canManageSettings(user)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-amber-800">
          Settings are limited to <strong>admin</strong> and{" "}
          <strong>supply_chain</strong>. Pick one of those users in the header.
        </p>
        <Link href="/" className="text-sm text-slate-700 underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage vendors, products, locations, product access, and expiry rules.
          Every change is written to the audit log.
        </p>
      </div>
      {children}
    </div>
  );
}
