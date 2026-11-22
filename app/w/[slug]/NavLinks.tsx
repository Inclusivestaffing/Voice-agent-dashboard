"use client";

import { useSearchParams } from "next/navigation";
import { navItems, keptQuery, useRole } from "@/components/navigation/nav";
import { NavLink, useOptimisticNav } from "@/components/navigation/NavLink";
import { useApp } from "@/components/context/AppContext";

/** Left sidebar navigation for a workspace (and the demo, with basePath="/demo"). */
/** `tabbar` is the phone version: a fixed bar at the bottom of the screen, icon above label. */
export default function NavLinks({ basePath, label = "Workspace", settings = true, variant = "sidebar" }: { basePath: string; label?: string; settings?: boolean; variant?: "sidebar" | "tabbar" }) {
  const sp = useSearchParams();
  const role = useRole();
  const nav = useOptimisticNav();
  const { live } = useApp();
  const qs = keptQuery(sp, basePath, live);

  if (variant === "tabbar") {
    return (
      <nav aria-label={label}
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/80 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {navItems(basePath, role, { settings }).map((it) => (
            <NavLink
              key={it.href}
              it={it}
              href={it.keepQuery ? `${it.href}${qs}` : it.href}
              current={nav.isCurrent(it)}
              onSelect={nav.select(it)}
              className="relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium [&>svg]:h-5 [&>svg]:w-5 [&>span:last-child]:absolute [&>span:last-child]:right-[calc(50%-20px)] [&>span:last-child]:top-2 [&>span:last-child]:ml-0"
              activeClass="text-zinc-900 [&>svg]:text-zinc-900 before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-full before:bg-zinc-900"
              idleClass="text-zinc-500 [&>svg]:text-zinc-400"
            />
          ))}
        </div>
      </nav>
    );
  }

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
