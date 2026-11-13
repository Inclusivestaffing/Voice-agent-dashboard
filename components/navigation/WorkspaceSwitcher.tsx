"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import CreateWorkspaceForm from "@/app/workspaces/CreateWorkspaceForm";
import { cx } from "@/components/ui";
import { ConnectForm } from "@/components/settings/RetellIntegration";
import { switchWorkspace } from "@/app/demo/settings/actions";
import { useApp } from "@/components/context/AppContext";

export interface WorkspaceLite { name: string; slug: string; logo_url?: string | null }

function Avatar({ ws, size = "md" }: { ws: WorkspaceLite; size?: "sm" | "md" }) {
  const box = size === "md" ? "h-8 w-8 text-[13px] rounded-md" : "h-6 w-6 text-[11px] rounded-md";
  // eslint-disable-next-line @next/next/no-img-element -- small workspace logo from Supabase storage
  if (ws.logo_url) return <img src={ws.logo_url} alt="" className={cx(box, "object-contain bg-white border border-zinc-200/70 shrink-0")} />;
  return (
    <span className={cx(box, "shrink-0 grid place-items-center font-semibold font-display text-white bg-gradient-to-br from-zinc-800 to-zinc-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]")}>
      {ws.name.trim().slice(0, 1).toUpperCase() || "W"}
    </span>
  );
}

const Check = () => (
  <svg className="h-4 w-4 text-zinc-900 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
);

/**
 * Workspace switcher at the top of the sidebar (Retell-style): shows the current workspace,
 * lists the others, and creates a new one in a dialog without leaving the page.
 */
export default function WorkspaceSwitcher({ current, workspaces, demo = false, settingsHref, createProblem = null }: {
  current: WorkspaceLite; workspaces: WorkspaceLite[]; demo?: boolean; settingsHref: string;
  /** Why a workspace can't be created right now (missing server setting), if anything. */
  createProblem?: string | null;
}) {
  const [switching, startSwitch] = useTransition();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const { live } = useApp();
  // A new workspace was created (or switched to): close the dialog.
  useEffect(() => { setCreating(false); }, [current.slug]);
  const href = (ws: WorkspaceLite) => `/w/${ws.slug}/overview`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "group w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left border transition-colors",
          open ? "bg-white border-zinc-200/80 shadow-[0_1px_2px_rgb(24_24_27/0.06)]" : "border-transparent hover:bg-zinc-200/50",
        )}
      >
        <Avatar ws={current} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-zinc-900 truncate leading-tight">{current.name}</span>
          <span className="block text-[11px] text-zinc-500 truncate leading-tight mt-0.5">{switching ? "Switching…" : demo ? (live ? "Live from Retell" : "Sample workspace") : "Workspace"}</span>
        </span>
        <svg className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
      </button>

      {open && (
        <div id={menuId} role="menu" aria-label="Workspaces"
          className="palette-in absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-zinc-200/80 bg-white p-1.5 shadow-pop">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-zinc-500">Workspaces</div>
          <div className="max-h-64 overflow-y-auto">
            {workspaces.map((ws) => {
              const on = ws.slug === current.slug;
              const body = (
                <>
                  <Avatar ws={ws} size="sm" />
                  <span className="flex-1 min-w-0 truncate font-medium text-zinc-800">{ws.name}</span>
                  {demo && ws.slug === "sample" && <span className="text-[11px] text-zinc-400">Sample</span>}
                  {on && <Check />}
                </>
              );
              const cls = cx("w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left", on ? "bg-zinc-100/80" : "hover:bg-zinc-50");
              return demo ? (
                <button key={ws.slug} type="button" role="menuitemradio" aria-checked={on} className={cls}
                  onClick={() => { setOpen(false); if (!on) startSwitch(() => switchWorkspace(ws.slug)); }}>
                  {body}
                </button>
              ) : (
                <Link key={ws.slug} href={href(ws)} role="menuitemradio" aria-checked={on} onClick={() => setOpen(false)} className={cls}>
                  {body}
                </Link>
              );
            })}
          </div>
          <div className="my-1.5 h-px bg-zinc-100" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setCreating(true); }}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            <span className="h-6 w-6 rounded-md border border-dashed border-zinc-300 grid place-items-center text-zinc-500">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            </span>
            Create workspace
          </button>
          <Link href={settingsHref} role="menuitem" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">
            <span className="h-6 w-6 grid place-items-center text-zinc-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </span>
            Workspace settings
          </Link>
          {!demo && (
            <Link href="/workspaces" role="menuitem" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">
              <span className="h-6 w-6 grid place-items-center text-zinc-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
              </span>
              All workspaces
            </Link>
          )}
        </div>
      )}

      {creating && <CreateDialog demo={demo} problem={createProblem} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateDialog({ demo, problem, onClose }: { demo: boolean; problem: string | null; onClose: () => void }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input, a, button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="palette-fade absolute inset-0 bg-zinc-900/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="palette-in relative w-full max-w-xl rounded-xl bg-white shadow-pop border border-zinc-200/70">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-zinc-100">
          <div>
            <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight text-zinc-900">Create workspace</h2>
            <p className="text-sm text-zinc-500 mt-0.5">One workspace per client. Connect their Retell account to see their real calls.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 -mr-2 rounded-md grid place-items-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5">
          {demo ? (
            <ConnectForm problem={problem} />
          ) : (
            <CreateWorkspaceForm />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
