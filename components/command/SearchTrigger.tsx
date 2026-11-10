"use client";

import { useEffect, useState } from "react";
import { openCommandPalette } from "./CommandPalette";

/** Sidebar "Search or jump to…" button that opens the command palette (and teaches its shortcut). */
export default function SearchTrigger() {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘"); }, []);
  return (
    <button
      type="button"
      onClick={() => openCommandPalette()}
      className="group flex w-full items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-left text-sm text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-700"
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <span className="flex-1 truncate">Search…</span>
      <kbd className="kbd">{mod}</kbd><kbd className="kbd -ml-1.5">K</kbd>
    </button>
  );
}
