"use client";

import { useSearchParams } from "next/navigation";
import { navItems, keptQuery, useRole } from "@/components/navigation/nav";
import { NavLink, useOptimisticNav } from "@/components/navigation/NavLink";
import { useApp } from "@/components/context/AppContext";

/** Left sidebar navigation for a workspace (and the demo, with basePath="/demo"). */
export default function NavLinks({ basePath, label = "Workspace", settings = true }: { basePath: string; label?: string; settings?: boolean }) {
  const sp = useSearchParams();
  const role = useRole();
  const nav = useOptimisticNav();
  const { live } = useApp();
  const qs = keptQuery(sp, basePath, live);

  return (
    <nav className="flex lg:flex-col gap-0.5 px-2.5 py-2 lg:py-3 overflow-x-auto" aria-label={label}>
      {navItems(basePath, role, { settings }).map((it) => (
        <NavLink
          key={it.href}
          it={it}
          href={it.keepQuery ? `${it.href}${qs}` : it.href}
          current={nav.isCurrent(it)}
          onSelect={nav.select(it)}
          className="press flex items-center gap-2.5 px-2.5 min-h-9 py-2 text-[13.5px] font-medium rounded-lg whitespace-nowrap transition-[background-color,color,box-shadow] duration-150"
          activeClass="bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(24_24_27/0.06),0_1px_2px_rgb(24_24_27/0.06)] [&>svg]:text-zinc-900"
          idleClass="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50 [&>svg]:text-zinc-400 hover:[&>svg]:text-zinc-700"
        />
      ))}
    </nav>
  );
}
