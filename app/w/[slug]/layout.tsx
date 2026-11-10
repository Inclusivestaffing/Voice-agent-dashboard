import Link from "next/link";
import { Suspense } from "react";
import { getWorkspace } from "@/lib/db/queries";
import { supabaseAdmin } from "@/lib/db/supabase";
import NavLinks from "./NavLinks";
import { InclusiveLogo } from "@/components/InclusiveLogo";
import CommandPalette from "@/components/command/CommandPalette";
import SearchTrigger from "@/components/command/SearchTrigger";
import Toaster from "@/components/feedback/Toaster";
import SidebarAccount from "@/components/navigation/SidebarAccount";
import { AppProvider } from "@/components/context/AppContext";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ws, role } = await getWorkspace(slug);
  const { data: conn } = await supabaseAdmin()
    .from("retell_connections")
    .select("last_synced_at, last_sync_error, api_key_last4")
    .eq("workspace_id", ws.id)
    .maybeSingle();

  return (
    <AppProvider initialRole={role} workspaceId={ws.id}>
      <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr] bg-slate-50/70">
        <aside className="bg-white border-b lg:border-b-0 lg:border-r border-slate-200/90 lg:sticky lg:top-0 lg:h-screen flex flex-col shadow-xs z-20 overflow-y-auto">
          {/* Top Logo & Workspace Brand */}
          <div className="p-4 lg:p-5 border-b border-slate-200/80 shrink-0">
            <InclusiveLogo href={`/w/${slug}/overview`} className="h-10 w-auto max-w-[200px]" />
            <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between min-w-0">
              <div className="min-w-0 flex items-center gap-2">
                {ws.logo_url ? (
                  <img src={ws.logo_url} alt="" className="h-6 w-auto max-w-[48px] object-contain rounded-md" />
                ) : (
                  <div className="h-6 w-6 shrink-0 rounded-md bg-slate-900 text-white font-semibold text-xs grid place-items-center">
                    {ws.name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-slate-900 truncate">{ws.name}</div>
                  <Link href="/workspaces" className="text-[10px] text-slate-400 hover:text-slate-700 transition">
                    Switch workspace ↗
                  </Link>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            </div>
          </div>

          {/* Nav Links */}
          {/* Command palette trigger */}
          <div className="hidden lg:block px-3 pt-3">
            <SearchTrigger />
          </div>

          <div className="flex-1 py-2">
            <Suspense fallback={<nav className="p-3 text-xs text-slate-400">Loading…</nav>}>
              <NavLinks basePath={`/w/${slug}`} />
            </Suspense>
          </div>

          {/* Sync status if connected */}
          {conn && (
            <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-0.5">
              <div className="font-medium text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Retell ····{conn.api_key_last4}
              </div>
              <div className="text-[10px] text-slate-400">
                {conn.last_synced_at ? `Synced ${new Date(conn.last_synced_at).toLocaleTimeString()}` : "Importing…"}
              </div>
            </div>
          )}

          {/* Left Side: Account Option with Admin, User, Client Controls & Ask AI */}
          <div className="p-3.5 mt-auto shrink-0 bg-white">
            <SidebarAccount name={ws.name} email="admin@inclusivestaffing.com" />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px]">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <CommandPalette basePath={`/w/${slug}`} />
      </Suspense>
      <Toaster />
    </AppProvider>
  );
}
