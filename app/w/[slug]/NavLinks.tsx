"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
import { navItems, keptQuery, isActive, useRole } from "@/components/navigation/nav";

/** Left sidebar navigation for a workspace (and the demo, with basePath="/demo"). */
export default function NavLinks({ basePath, label = "Workspace", settings = true }: { basePath: string; label?: string; settings?: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const role = useRole();
  const qs = keptQuery(sp);

  return (
    <nav className="flex lg:flex-col gap-1 p-2 lg:p-3 overflow-x-auto flex-1 lg:flex-none" aria-label={label}>
      {navItems(basePath, role, { settings }).map((it) => {
        const active = isActive(path, it);
        return (
          <Link
            key={it.href}
            href={it.keepQuery ? `${it.href}${qs}` : it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
              active ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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
