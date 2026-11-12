"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };

function isActive(path: string, href: string, links: NavLink[]) {
  if (href === "/") return path === "/";
  if (path === href) return true;
  const childMatch = links.some(
    (link) =>
      link.href !== href &&
      link.href.startsWith(`${href}/`) &&
      (path === link.href || path.startsWith(`${link.href}/`)),
  );
  if (childMatch) return false;
  return path.startsWith(`${href}/`);
}

export function SideNav({
  links,
  compact = false,
}: {
  links: NavLink[];
  compact?: boolean;
}) {
  const path = usePathname();

  return (
    <nav
      className={
        compact
          ? "flex gap-1 overflow-x-auto bg-pc-teal px-2 py-2 md:hidden"
          : "flex flex-col gap-1 px-3 py-3"
      }
    >
      {links.map((link) => {
        const active = isActive(path, link.href, links);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              compact
                ? `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                    active
                      ? "bg-white text-pc-teal"
                      : "text-white/85 hover:bg-white/10"
                  }`
                : `rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
