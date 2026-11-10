import { Suspense } from "react";
import { DEMO_QS } from "@/lib/demo/range";
import DemoNav from "./DemoNav";
import { InclusiveLogo } from "@/components/InclusiveLogo";
import CommandPalette from "@/components/command/CommandPalette";
import SearchTrigger from "@/components/command/SearchTrigger";
import Toaster from "@/components/feedback/Toaster";
import SidebarAccount from "@/components/navigation/SidebarAccount";
import { AppProvider } from "@/components/context/AppContext";

/** Preview of the full product on the Open Water Marine sample calls. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider initialRole="admin" workspaceId="demo">
      <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr] bg-slate-50/70">
        <aside className="bg-white border-b lg:border-b-0 lg:border-r border-slate-200/90 lg:sticky lg:top-0 lg:h-screen flex flex-col shadow-xs z-20 overflow-y-auto">
          {/* Top Logo & Workspace Brand */}
          <div className="p-4 lg:p-5 border-b border-slate-200/80 shrink-0">
            <InclusiveLogo href={`/demo?${DEMO_QS}`} className="h-10 w-auto max-w-[200px]" />
            <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-xs text-slate-900 truncate">Open Water Marine</div>
                <div className="text-[11px] text-slate-400">Demo workspace</div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          {/* Command palette trigger */}
          <div className="hidden lg:block px-3 pt-3">
            <SearchTrigger />
          </div>

          <div className="flex-1 py-2">
            <Suspense fallback={<nav className="p-3 text-xs text-slate-400">Loading…</nav>}>
              <DemoNav />
            </Suspense>
          </div>

          {/* Left Side: Account Option with Admin, User, Client Controls & Ask AI */}
          <div className="p-3.5 mt-auto shrink-0 bg-white">
            <SidebarAccount name="Inclusive Staffing" email="admin@inclusivestaffing.com" />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px]">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <CommandPalette basePath="/demo" />
      </Suspense>
      <Toaster />
    </AppProvider>
  );
}
