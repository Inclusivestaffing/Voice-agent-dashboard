"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/context/AppContext";
import { toast } from "@/components/feedback/Toaster";
import { signOut } from "@/app/unlock/actions";

const SECTIONS: [RegExp, string, string][] = [
  [/\/calls\/[^/]+$/, "Call History", "/calls"],
  [/\/calls$/, "Call History", ""],
  [/\/reports\/(view|[^/]+)$/, "Reports", "/reports"],
  [/\/reports$/, "Reports", ""],
  [/\/settings$/, "Settings", ""],
];

/** Sticky bar at the top of the content sheet: where you are, plus the two global actions. */
export default function TopBar({ basePath, workspaceName, canLogOut = false }: { basePath: string; workspaceName: string; canLogOut?: boolean }) {
  const path = usePathname();
  const { openAskAi } = useApp();
  const hit = SECTIONS.find(([re]) => re.test(path));
  const section = hit?.[1] ?? "Analytics";
  const parentHref = hit?.[2] ? `${basePath}${hit[2]}` : null;
  const leaf = path.match(/\/calls\/([^/]+)$/) ? "Call" : path.endsWith("/reports/view") || /\/reports\/[^/]+$/.test(path) && !path.endsWith("/reports") ? "Report" : null;

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); toast("Link copied"); }
    catch { toast("Couldn't copy the link", "error"); }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-200/70 bg-white/85 px-4 sm:px-6 lg:px-8 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-[13px] min-w-0">
          <li className="text-zinc-500 truncate max-w-[40%] hidden sm:block">{workspaceName}</li>
          <li aria-hidden className="text-zinc-300 hidden sm:block">/</li>
          {leaf && parentHref ? (
            <>
              <li className="truncate"><Link href={parentHref} className="text-zinc-500 hover:text-zinc-900">{section}</Link></li>
              <li aria-hidden className="text-zinc-300">/</li>
              <li className="font-medium text-zinc-900 truncate" aria-current="page">{leaf}</li>
            </>
          ) : (
            <li className="font-medium text-zinc-900 truncate" aria-current="page">{section}</li>
          )}
        </ol>
      </nav>
      <button type="button" onClick={copyLink} aria-label="Copy link to this view"
        className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        Copy link
      </button>
      <button type="button" onClick={() => openAskAi()}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 pl-2.5 pr-3 text-[13px] font-medium text-white shadow-[0_1px_2px_rgb(24_24_27/0.2),inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-zinc-800">
        <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="m12 2 1.9 5.6a3 3 0 0 0 1.9 1.9L21.4 11.4 15.8 13.3a3 3 0 0 0-1.9 1.9L12 20.8l-1.9-5.6a3 3 0 0 0-1.9-1.9L2.6 11.4l5.6-1.9a3 3 0 0 0 1.9-1.9Z" /></svg>
        Ask AI
      </button>
      {canLogOut && (
        <form action={signOut}>
          <button type="submit" aria-label="Log out" title="Log out"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
            <span className="hidden sm:inline">Log out</span>
          </button>
        </form>
      )}
    </header>
  );
}
