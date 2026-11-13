import { Suspense } from "react";
import { InclusiveLogo } from "@/components/InclusiveLogo";
import CommandPalette from "@/components/command/CommandPalette";
import Toaster from "@/components/feedback/Toaster";
import SidebarAccount from "@/components/navigation/SidebarAccount";
import WorkspaceSwitcher, { type WorkspaceLite } from "@/components/navigation/WorkspaceSwitcher";
import TopBar from "@/components/navigation/TopBar";
import NavLinks from "@/app/w/[slug]/NavLinks";

/**
 * App frame shared by real workspaces and the demo.
 *
 *   ┌ frame (#F4F4F5) ────────────────────────────────────────────────┐
 *   │ logo          ┌ sheet (white, 16px radius) ──────────────────┐ │
 *   │ [workspace ▾] │ breadcrumb                 Copy link  Ask AI │ │
 *   │ Analytics     │──────────────────────────────────────────────│ │
 *   │ Call History  │ page                                         │ │
 *   │ …             │                                              │ │
 *   │ status · me   └──────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────────┘
 */
export default function AppShell({ basePath, logoHref, current, workspaces, demo = false, status, account, canLogOut = false, children }: {
  basePath: string;
  logoHref: string;
  current: WorkspaceLite;
  workspaces: WorkspaceLite[];
  demo?: boolean;
  status?: React.ReactNode;
  account: { name: string; email: string };
  /** Show Log out (the dashboard is behind the password sign-in). */
  canLogOut?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop">Skip to content</a>
      <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="z-20 flex flex-col lg:sticky lg:top-0 lg:h-dvh">
          <div className="px-4 pt-4 pb-2 shrink-0">
            <InclusiveLogo href={logoHref} className="h-8 w-auto max-w-[160px]" />
          </div>
          <div className="px-2.5 pb-1 shrink-0">
            <WorkspaceSwitcher current={current} workspaces={workspaces} demo={demo} settingsHref={`${basePath}/settings`} />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <Suspense fallback={<nav className="p-3 text-xs text-zinc-400">Loading…</nav>}>
              <NavLinks basePath={basePath} label={demo ? "Demo workspace" : "Workspace"} />
            </Suspense>
          </div>

          <div className="hidden lg:block shrink-0 p-2.5 space-y-1">
            {status}
            <SidebarAccount name={account.name} email={account.email} basePath={basePath} canLogOut={canLogOut} />
          </div>
        </aside>

        <div className="min-w-0 lg:py-2 lg:pr-2">
          <div className="min-h-dvh lg:min-h-[calc(100dvh-16px)] bg-white lg:rounded-2xl lg:shadow-[var(--shadow-sheet)] border-t border-zinc-200/70 lg:border-t-0">
            <TopBar basePath={basePath} workspaceName={current.name} canLogOut={canLogOut} />
            <main id="content" className="page-enter mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8 pt-6 pb-16 lg:pt-8">
              {children}
            </main>
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <CommandPalette basePath={basePath} />
      </Suspense>
      <Toaster />
    </>
  );
}

/** Small connection line for the sidebar footer. */
export function SyncStatus({ syncedAt, note, label = "Retell connected", idle = false }: { last4?: string; syncedAt: string | null; note?: string; label?: string; idle?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-zinc-500">
      <span className="relative flex h-2 w-2" aria-hidden>
        {!idle && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />}
        <span className={idle ? "relative inline-flex h-2 w-2 rounded-full bg-zinc-300" : "relative inline-flex h-2 w-2 rounded-full bg-emerald-500"} />
      </span>
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 tabular text-zinc-400">{note ?? (syncedAt ? `Synced ${new Date(syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Importing…")}</span>
    </div>
  );
}
