"use client";

import { useSearchParams } from "next/navigation";
import { keptQuery, useRole, Icons, type NavItem } from "./nav";
import { NavLink, useOptimisticNav } from "./NavLink";
import { canSeeInsights } from "@/lib/roles";

interface TopTabBarProps {
  basePath: string; // e.g. "/demo" or `/w/${slug}`
}

/**
 * Sub-tabs for the analytics views: only "Analytics" and "Insights".
 * Call History, Reports and Settings live in the sidebar.
 */
export function TopTabBar({ basePath }: TopTabBarProps) {
  const sp = useSearchParams();
  const role = useRole();
  const nav = useOptimisticNav();
  const qs = keptQuery(sp, basePath);
  const demo = basePath === "/demo";

  const tabs: NavItem[] = [
    { href: demo ? "/demo" : `${basePath}/overview`, label: "Analytics", icon: Icons.analytics, exact: demo, keepQuery: true },
  ];
  if (canSeeInsights(role)) tabs.push({ href: `${basePath}/insights`, label: "Insights", icon: Icons.insights, keepQuery: true });

  // A single tab isn't a choice; don't render the bar.
  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center border-b border-slate-200/90 mb-5 gap-1 overflow-x-auto" role="navigation" aria-label="Analytics views">
      {tabs.map((tab) => (
        <NavLink
          key={tab.href}
          it={tab}
          href={tab.keepQuery ? `${tab.href}${qs}` : tab.href}
          current={nav.isCurrent(tab)}
          onSelect={nav.select(tab)}
          className="press flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors duration-150"
          activeClass="border-slate-900 text-slate-900"
          idleClass="border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
        />
      ))}
    </div>
  );
}
