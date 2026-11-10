"use client";

import { useSearchParams } from "next/navigation";
import { navItems, keptQuery, useRole } from "@/components/navigation/nav";
import { NavLink, useOptimisticNav } from "@/components/navigation/NavLink";

/** Left sidebar navigation for a workspace (and the demo, with basePath="/demo"). */
export default function NavLinks({ basePath, label = "Workspace", settings = true }: { basePath: string; label?: string; settings?: boolean }) {
  const sp = useSearchParams();
  const role = useRole();
  const nav = useOptimisticNav();
  const qs = keptQuery(sp, basePath);

  return (
    <nav className="flex lg:flex-col gap-1 p-2 lg:p-3 overflow-x-auto flex-1 lg:flex-none" aria-label={label}>
      {navItems(basePath, role, { settings }).map((it) => (
        <NavLink
          key={it.href}
          it={it}
          href={it.keepQuery ? `${it.href}${qs}` : it.href}
          current={nav.isCurrent(it)}
          onSelect={nav.select(it)}
          className="press flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors duration-150"
          activeClass="bg-slate-900 text-white shadow-xs"
          idleClass="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        />
      ))}
    </nav>
  );
}
