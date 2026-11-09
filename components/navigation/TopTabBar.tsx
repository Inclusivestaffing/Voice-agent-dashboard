"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
import { keptQuery, isActive, useRole, Icons, type NavItem } from "./nav";
import { canSeeInsights } from "@/lib/roles";

interface TopTabBarProps {
  basePath: string; // e.g. "/demo" or `/w/${slug}`
}

/**
 * Top sub-tab bar for Analytics views:
 * Shows ONLY "Analytics" and "Insights".
 * Call History, Reports, and Settings are removed from the Analytics view.
 */
export function TopTabBar({ basePath }: TopTabBarProps) {
  const path = usePathname();
  const sp = useSearchParams();
  const role = useRole();
  const qs = keptQuery(sp);

  const demo = basePath === "/demo";

  // In the analytics view, ONLY show Analytics & Insights.
  // Call History, Reports, and Settings are removed.
  const tabs: NavItem[] = [
    {
      href: demo ? "/demo" : `${basePath}/overview`,
      label: "Analytics",
      icon: Icons.analytics,
      exact: demo,
      keepQuery: true,
    },
  ];

  if (canSeeInsights(role)) {
    tabs.push({
      href: `${basePath}/insights`,
      label: "Insights",
      icon: Icons.insights,
      keepQuery: true,
    });
  }

  // If only 1 tab is available (or user is not on an analytics view), don't render an unnecessary bar
  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center border-b border-slate-200/90 mb-5 gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = isActive(path, tab);
        return (
          <Link
            key={tab.href}
            href={tab.keepQuery ? `${tab.href}${qs}` : tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap",
              active
                ? "border-slate-900 text-slate-900 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            )}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
