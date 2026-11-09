"use client";

import Link from "next/link";
import { useApp } from "@/components/context/AppContext";
import { ROLE_LABEL } from "@/lib/roles";
import { cx } from "@/components/ui";

interface SidebarAccountProps {
  email?: string;
  name?: string;
  basePath?: string;
  className?: string;
}

export default function SidebarAccount({
  email = "admin@inclusivestaffing.com",
  name = "Inclusive Staffing",
  basePath = "/demo",
  className,
}: SidebarAccountProps) {
  const { role, openAskAi } = useApp();
  const settingsHref = `${basePath}/settings`;

  return (
    <div className={cx("space-y-2.5 pt-3 border-t border-slate-200/80", className)}>
      {/* Ask AI Sidebar Button */}
      <button
        type="button"
        onClick={() => openAskAi()}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold rounded-lg bg-purple-50 text-purple-900 hover:bg-purple-100/80 border border-purple-200/80 transition shadow-xs group"
      >
        <div className="flex items-center gap-2">
          <span className="text-base text-purple-600 group-hover:scale-110 transition-transform">✨</span>
          <span>Ask AI Analyst</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-200/60 text-purple-800">
          Chat
        </span>
      </button>

      {/* Clean Account Profile Card (Clicking goes to Settings where controls live) */}
      <Link
        href={settingsHref}
        className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-100/80 border border-transparent hover:border-slate-200 transition group text-left"
        title="Manage account & role controls in Settings"
      >
        <div className="h-8 w-8 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
          IS
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-900 truncate group-hover:text-slate-950">
              {name}
            </span>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-600">
              {ROLE_LABEL[role]}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">{email}</div>
        </div>
        <svg
          className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>
    </div>
  );
}
