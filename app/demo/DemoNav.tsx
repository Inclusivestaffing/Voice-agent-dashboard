"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
import { navItems, keptQuery, isActive, useRole } from "@/components/navigation/nav";

export default function DemoNav() {
  const path = usePathname();
  const sp = useSearchParams();
  const role = useRole();
  const qs = keptQuery(sp);

  const items = navItems("/demo", role);

  return (
    <nav className="flex lg:flex-col gap-1 p-2 lg:p-3 overflow-x-auto flex-1 lg:flex-none" aria-label="Demo workspace">
      {items.map((it) => {
        const active = isActive(path, it);
        return (
          <Link
            key={it.href}
            href={it.label === "Reports" ? it.href : `${it.href}${qs}`}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap",
              active
                ? "bg-slate-900 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            {it.icon}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
