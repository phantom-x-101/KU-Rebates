import type { ReactNode } from "react";
import Link from "next/link";
import { resetDemoAction } from "@/app/demo/actions";
import { SideNav, type NavLink } from "@/components/SideNav";
import { UserPicker } from "@/components/UserPicker";
import { canManageSettings } from "@/lib/settings";
import type { User } from "@/db/schema";

function navLinks(currentUser: User | null): NavLink[] {
  if (currentUser?.role === "supply_chain") {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/cases", label: "Cases" },
      { href: "/reorder", label: "Reorder" },
      { href: "/exceptions", label: "Exceptions" },
      { href: "/settings", label: "Settings" },
    ];
  }
  if (currentUser?.role === "category_owner") {
    return [
      { href: "/stock", label: "Stock" },
      { href: "/rebates", label: "Rebates" },
      { href: "/contracts", label: "Contracts" },
      { href: "/exceptions", label: "Exceptions" },
    ];
  }
  if (currentUser?.role === "vendor_rep") {
    return [
      { href: "/vendor", label: "Vendor portal" },
      { href: "/vendor/stock", label: "Vendor stock" },
      { href: "/reorder", label: "Reorder" },
    ];
  }

  const links: NavLink[] = [
    { href: "/demo", label: "Simulate Flow" },
    { href: "/station", label: "Scan station" },
  ];
  if (currentUser && ["admin"].includes(currentUser.role)) {
    links.push({ href: "/dashboard", label: "Dashboard" });
  }
  if (currentUser) {
    links.push({ href: "/stock", label: "Stock" });
  }
  if (currentUser && ["tech", "admin"].includes(currentUser.role)) {
    links.push(
      { href: "/cases", label: "Cases" },
      { href: "/scan/arrival", label: "Scan arrival" },
    );
  }
  if (canManageSettings(currentUser)) {
    links.push(
      { href: "/reorder", label: "Reorder" },
      { href: "/exceptions", label: "Exceptions" },
      { href: "/rebates", label: "Rebates" },
      { href: "/contracts", label: "Contracts" },
      { href: "/settings", label: "Settings" },
    );
  }
  return links;
}

export function AppFrame({
  users,
  currentUser,
  children,
}: {
  users: User[];
  currentUser: User | null;
  children: ReactNode;
}) {
  const links = navLinks(currentUser);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--pc-line)] bg-white px-4 py-2.5 md:px-5">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/pycube-mark.jpg"
            alt=""
            className="h-9 w-9 object-contain"
          />
          <span className="text-[1.35rem] font-bold leading-none tracking-[0.16em]">
            <span className="text-[#0e5f78]">PY</span>
            <span className="text-[#2f93c7]">CUBE</span>
          </span>
          <span className="border-l border-[var(--pc-line)] pl-3 text-base font-semibold tracking-normal text-[#16323c]">
            Rebate Prototype
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {currentUser ? (
            <form action={resetDemoAction}>
              <button
                type="submit"
                className="rounded-lg bg-pc-teal px-3 py-2 text-sm font-semibold text-white"
              >
                Reset demo
              </button>
            </form>
          ) : null}
          <UserPicker users={users} currentUserId={currentUser?.id ?? null} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 overflow-y-auto bg-pc-teal md:block">
          <p className="px-6 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Consignment
          </p>
          <SideNav links={links} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <SideNav links={links} compact />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
            {children}
          </main>
          <footer className="px-6 pb-6 text-xs text-slate-500">
            Demo data. Vendor C through Vendor G, prices, and quantities are
            placeholders. PyCube shows suggestions only and does not place orders.
          </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
