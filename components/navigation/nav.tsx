"use client";

import { createContext, useContext } from "react";
import { canEdit, canSeeInsights, type Role } from "@/lib/roles";
import { useApp } from "@/components/context/AppContext";

/** Fallback RoleContext if AppProvider is not around */
const RoleContext = createContext<Role | null>(null);
export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  const app = useApp();
  const legacyRole = useContext(RoleContext);
  return app?.role ?? legacyRole ?? "admin";
}

const I = ({ children }: { children: React.ReactNode }) => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

export const Icons = {
  analytics: (
    <I>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </I>
  ),
  calls: (
    <I>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      <polyline points="16 2 20 6 16 10" />
    </I>
  ),
  insights: (
    <I>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </I>
  ),
  reports: (
    <I>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </I>
  ),
  settings: (
    <I>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </I>
  ),
  askAi: (
    <I>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </I>
  ),
};

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  keepQuery: boolean;
}

/** Workspace sections visible to a role. `basePath` is "/demo" or `/w/<slug>`. */
export function navItems(basePath: string, role: Role, opts: { settings?: boolean } = {}): NavItem[] {
  const demo = basePath === "/demo";
  const includeSettings = opts.settings ?? true;

  const items: NavItem[] = [
    { href: demo ? "/demo" : `${basePath}/overview`, label: "Analytics", icon: Icons.analytics, exact: demo, keepQuery: true },
    { href: `${basePath}/calls`, label: "Call History", icon: Icons.calls, keepQuery: true },
  ];
  if (canSeeInsights(role)) {
    items.push({ href: `${basePath}/insights`, label: "Insights", icon: Icons.insights, keepQuery: true });
  }
  items.push({ href: `${basePath}/reports`, label: "Reports", icon: Icons.reports, keepQuery: false });
  if (includeSettings && canEdit(role)) {
    items.push({ href: `${basePath}/settings`, label: "Settings", icon: Icons.settings, keepQuery: false });
  }
  return items;
}

/** Carry the date range and agent across sections so switching keeps context. */
export function keptQuery(sp: URLSearchParams | { get(k: string): string | null }) {
  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to", "ft", "tt", "agent"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  return keep.toString() ? `?${keep}` : "";
}

export const isActive = (path: string, it: NavItem) =>
  it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
