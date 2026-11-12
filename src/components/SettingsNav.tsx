import Link from "next/link";

const links = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/vendors", label: "Vendors" },
  { href: "/settings/products", label: "Products" },
  { href: "/settings/locations", label: "Locations" },
  { href: "/settings/product-access", label: "Product access" },
  { href: "/settings/expiry-rules", label: "Expiry rules" },
  { href: "/settings/audit", label: "Audit log" },
];

export function SettingsNav({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm">
      {links.map((l) => {
        const active = current === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "rounded bg-pc-teal px-2.5 py-1 font-medium text-white"
                : "rounded px-2.5 py-1 text-slate-700 hover:bg-slate-200"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
