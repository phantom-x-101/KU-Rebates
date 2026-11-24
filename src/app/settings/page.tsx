import Link from "next/link";
import { setSoftTriggerAction } from "@/app/settings/actions";
import { SettingsForm } from "@/components/SettingsForm";
import { SettingsNav } from "@/components/SettingsNav";
import {
  isScanDebugEnabled,
  isSoftTriggerEnabled,
  listExpiryRules,
  listProductAccess,
  listProducts,
  listStorageLocations,
  listVendors,
} from "@/lib/settings";

export default async function SettingsHomePage() {
  const [vendorCount, productCount, locationCount, accessCount, ruleCount, softTrigger, scanDebug] =
    await Promise.all([
      listVendors().then((r) => r.length),
      listProducts().then((r) => r.length),
      listStorageLocations().then((r) => r.length),
      listProductAccess().then((r) => r.length),
      listExpiryRules().then((r) => r.length),
      isSoftTriggerEnabled(),
      isScanDebugEnabled(),
    ]);

  return (
    <>
      <SettingsNav current="/settings" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/settings/vendors", label: "Vendors", count: vendorCount },
          { href: "/settings/products", label: "Products", count: productCount },
          {
            href: "/settings/locations",
            label: "Storage locations",
            count: locationCount,
          },
          {
            href: "/settings/product-access",
            label: "Product access",
            count: accessCount,
          },
          {
            href: "/settings/expiry-rules",
            label: "Expiry rules",
            count: ruleCount,
          },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
            >
              <span className="font-medium text-slate-900">{item.label}</span>
              <span className="mt-1 block text-sm text-slate-600">
                {item.count} row{item.count === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="rounded border border-slate-200 bg-white px-4 py-4">
        <h2 className="font-medium text-slate-900">Scanner (experimental)</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Off by default. Soft trigger opens DataWedge&apos;s software barcode
          or RFID intent. Scan debug shows the live keystroke buffer on Check
          in and Check out. Scanning still uses the keyboard wedge.
        </p>
        <div className="mt-3">
          <SettingsForm action={setSoftTriggerAction} submitLabel="Save">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                name="softTrigger"
                value="on"
                defaultChecked={softTrigger}
              />
              Try soft trigger
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                name="scanDebug"
                value="on"
                defaultChecked={scanDebug}
              />
              Show scan buffer (debug)
            </label>
          </SettingsForm>
        </div>
      </section>
    </>
  );
}
