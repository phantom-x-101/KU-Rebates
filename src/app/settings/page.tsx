import Link from "next/link";
import { SettingsNav } from "@/components/SettingsNav";
import {
  listExpiryRules,
  listProductAccess,
  listProducts,
  listStorageLocations,
  listVendors,
} from "@/lib/settings";

export default async function SettingsHomePage() {
  const [vendorCount, productCount, locationCount, accessCount, ruleCount] =
    await Promise.all([
      listVendors().then((r) => r.length),
      listProducts().then((r) => r.length),
      listStorageLocations().then((r) => r.length),
      listProductAccess().then((r) => r.length),
      listExpiryRules().then((r) => r.length),
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
    </>
  );
}
