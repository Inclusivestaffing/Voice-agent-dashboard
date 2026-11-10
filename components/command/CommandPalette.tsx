"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { useApp } from "@/components/context/AppContext";
import { navItems, useRole, Icons } from "@/components/navigation/nav";
import { RANGE_PRESETS } from "@/lib/filters";
import { DEMO_QS } from "@/lib/demo/range";
import { toast } from "@/components/feedback/Toaster";

/** Open the palette from anywhere (sidebar search button, other components). */
export const openCommandPalette = (mode: "search" | "shortcuts" = "search") =>
  window.dispatchEvent(new CustomEvent("va:palette", { detail: mode }));
/** Ask the Call History page to export the rows it is showing. */
export const EXPORT_EVENT = "va:export-calls";

interface Command {
  id: string;
  group: "Go to" | "Date range" | "Actions" | "Search";
  label: string;
  hint?: string;
  keys?: string[];
  icon: React.ReactNode;
  run: () => void;
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const typingIn = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Open command palette" },
  { keys: ["/"], label: "Search / jump to" },
  { keys: ["G", "A"], label: "Go to Analytics" },
  { keys: ["G", "C"], label: "Go to Call History" },
  { keys: ["G", "I"], label: "Go to Insights" },
  { keys: ["G", "R"], label: "Go to Reports" },
  { keys: ["G", "S"], label: "Go to Settings" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
  { keys: ["Esc"], label: "Close dialogs" },
];

const ic = (d: React.ReactNode) => <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const I = {
  calendar: ic(<><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  link: ic(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>),
  download: ic(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>),
  search: ic(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  keyboard: ic(<><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10" /></>),
  refresh: ic(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>),
};

/** Command palette + global keyboard shortcuts. Mount once in each workspace layout. */
export default function CommandPalette({ basePath }: { basePath: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const role = useRole();
  const { openAskAi, workspaceId } = useApp();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "shortcuts">("search");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const demo = basePath === "/demo";

  const close = useCallback(() => { setOpen(false); setQ(""); setActive(0); }, []);
  const show = useCallback((m: "search" | "shortcuts") => { setMode(m); setOpen(true); setActive(0); }, []);

  /** Current filters (range, agent, …) to carry into a destination. */
  const filterQs = useCallback(() => {
    const n = new URLSearchParams(sp.toString());
    n.delete("page");
    if (demo && !n.get("range")) return DEMO_QS;
    return n.toString();
  }, [sp, demo]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const pages = navItems(basePath, role).map<Command>((it) => ({
      id: `go-${it.label}`, group: "Go to", label: it.label, icon: it.icon,
      keys: ["G", it.label === "Call History" ? "C" : it.label[0]],
      run: go(it.keepQuery ? `${it.href}?${filterQs()}` : it.href),
    }));

    const analyticsHref = demo ? "/demo" : `${basePath}/overview`;
    const onDataPage = [analyticsHref, `${basePath}/calls`, `${basePath}/insights`].includes(path);
    const target = onDataPage ? path : analyticsHref;
    const withRange = (range: string, extra?: Record<string, string>) => {
      const n = new URLSearchParams(sp.toString());
      for (const k of ["from", "to", "ft", "tt", "page"]) n.delete(k);
      n.set("range", range);
      for (const [k, v] of Object.entries(extra ?? {})) n.set(k, v);
      return `${target}?${n}`;
    };
    const ranges: Command[] = RANGE_PRESETS.filter((r) => r.id !== "custom").map((r) => ({
      id: `range-${r.id}`, group: "Date range", label: r.label, icon: I.calendar,
      hint: sp.get("range") === r.id ? "Current" : undefined,
      run: go(withRange(r.id)),
    }));
    if (demo) {
      ranges.unshift({ id: "range-demo", group: "Date range", label: "Sample period (Aug 27 – Sep 30, 2026)", icon: I.calendar, run: go(`${target}?${DEMO_QS}`) });
    }

    const actions: Command[] = [
      { id: "ask", group: "Actions", label: "Ask AI about these calls", icon: Icons.askAi, run: () => openAskAi() },
      {
        id: "copy", group: "Actions", label: "Copy link to this view", hint: "Keeps filters and date range", icon: I.link,
        run: async () => {
          try { await navigator.clipboard.writeText(window.location.href); toast("Link copied"); }
          catch { toast("Couldn't copy. Copy the address bar instead.", "error"); }
        },
      },
      { id: "refresh", group: "Actions", label: "Refresh data", icon: I.refresh, run: () => { router.refresh(); toast("Refreshing…", "default"); } },
      { id: "keys", group: "Actions", label: "Keyboard shortcuts", icon: I.keyboard, keys: ["?"], run: () => show("shortcuts") },
    ];
    if (!demo) {
      actions.splice(2, 0, {
        id: "export", group: "Actions", label: "Export calls as CSV", hint: "Uses the current filters", icon: I.download,
        run: () => { window.location.assign(`/api/w/${workspaceId}/export?${filterQs()}`); toast("Preparing your CSV…", "default"); },
      });
    } else if (path === "/demo/calls") {
      actions.splice(2, 0, {
        id: "export", group: "Actions", label: "Export these calls as CSV", icon: I.download,
        run: () => window.dispatchEvent(new Event(EXPORT_EVENT)),
      });
    }
    return [...pages, ...actions, ...ranges];
  }, [basePath, role, demo, path, sp, router, filterQs, openAskAi, workspaceId, show]);

  // Ranked substring match; free text also offers "search transcripts" and "ask AI".
  const results = useMemo<Command[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return commands;
    const words = term.split(/\s+/);
    const scored = commands
      .map((c) => {
        const hay = `${c.label} ${c.group} ${c.hint ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        return { c, s: (c.label.toLowerCase().startsWith(term) ? 0 : 1) + hay.indexOf(words[0]) / 100 };
      })
      .filter((x): x is { c: Command; s: number } => !!x)
      .sort((a, b) => a.s - b.s)
      .map((x) => x.c);
    const raw = q.trim();
    const free: Command[] = [
      { id: "search-calls", group: "Search", label: `Search call transcripts for “${raw}”`, icon: I.search,
        run: () => router.push(`${basePath}/calls?${filterQs()}&q=${encodeURIComponent(raw.slice(0, 200))}`) },
      { id: "ask-q", group: "Search", label: `Ask AI: “${raw}”`, icon: Icons.askAi, run: () => openAskAi(raw.slice(0, 2000)) },
    ];
    return [...scored, ...free];
  }, [q, commands, basePath, filterQs, openAskAi, router]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    if (c.id !== "keys") close();
    c.run();
  };

  // Global shortcuts.
  useEffect(() => {
    let gPressedAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) close(); else show("search"); return; }
      if (open || typingIn(e.target) || mod || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); show("search"); return; }
      if (e.key === "?") { e.preventDefault(); show("shortcuts"); return; }
      const k = e.key.toLowerCase();
      if (k === "g") { gPressedAt = Date.now(); return; }
      if (Date.now() - gPressedAt < 1200) {
        gPressedAt = 0;
        const label = { a: "Analytics", c: "Call History", i: "Insights", r: "Reports", s: "Settings" }[k];
        const cmd = label && commands.find((c) => c.id === `go-${label}`);
        if (cmd) { e.preventDefault(); cmd.run(); }
      }
    };
    const onOpen = (e: Event) => show(((e as CustomEvent).detail as "search" | "shortcuts") ?? "search");
    window.addEventListener("keydown", onKey);
    window.addEventListener("va:palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("va:palette", onOpen); };
  }, [open, commands, close, show]);

  useEffect(() => { if (open && mode === "search") inputRef.current?.focus(); }, [open, mode]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[active]); }
  };

  let lastGroup = "";
  const modKey = isMac() ? "⌘" : "Ctrl";

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px] palette-fade" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "search" ? "Command palette" : "Keyboard shortcuts"}
        className="palette-in relative w-full max-w-[620px] overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-pop"
        onKeyDown={mode === "search" ? onListKey : (e) => { if (e.key === "Escape") close(); }}
        tabIndex={-1}
      >
        {mode === "search" ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 px-4">
              <span className="text-slate-400">{I.search}</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search pages, date ranges, actions, or type a question…"
                aria-label="Search commands"
                aria-controls="palette-list"
                aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
                role="combobox"
                aria-expanded="true"
                className="h-14 flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:outline-none focus-visible:outline-none"
              />
              <kbd className="kbd">Esc</kbd>
            </div>
            <div ref={listRef} id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
              {results.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {header && <div className="px-3 pb-1.5 pt-3 text-xs font-medium text-slate-400 first:pt-1">{header}</div>}
                    <button
                      id={`cmd-${c.id}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(c)}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm active:!scale-100",
                        i === active ? "bg-slate-100 text-slate-900" : "text-slate-700"
                      )}
                    >
                      <span className={cx("grid h-8 w-8 place-items-center rounded-lg border", i === active ? "border-slate-200 bg-white text-slate-900" : "border-slate-100 bg-slate-50 text-slate-500")}>{c.icon}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                      {c.hint && <span className="text-xs text-slate-400">{c.hint}</span>}
                      {c.keys && <span className="flex gap-1">{c.keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
              <span className="flex items-center gap-1.5"><kbd className="kbd">↵</kbd> open</span>
              <button onClick={() => setMode("shortcuts")} className="ml-auto flex items-center gap-1.5 hover:text-slate-800"><kbd className="kbd">?</kbd> shortcuts</button>
            </div>
          </>
        ) : (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Keyboard shortcuts</h2>
              <button onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
            </div>
            <ul className="divide-y divide-slate-100">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between py-2.5 text-sm text-slate-700">
                  {s.label}
                  <span className="flex gap-1">{s.keys.map((k) => <kbd key={k} className="kbd">{k === "Ctrl" ? modKey : k}</kbd>)}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => setMode("search")} className="mt-4 text-sm font-medium text-slate-600 hover:text-slate-900">← Back to search</button>
          </div>
        )}
      </div>
    </div>
  );
}
