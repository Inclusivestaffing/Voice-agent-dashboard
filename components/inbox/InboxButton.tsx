"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import InboxRow from "./InboxRow";
import { useInbox } from "./useInbox";

/**
 * Top-right inbox: a badge with the unread count and a panel with the newest urgent items from every
 * workspace. Each item links straight to the call (or the Automation report).
 */
export default function InboxButton() {
  const { data, error, unread, isUnread, setRead, readAll, refresh } = useInbox(null, 40);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"unread" | "all">("unread");
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = "inbox-panel"; // one per page; a fixed id avoids server/browser id mismatches

  useEffect(() => {
    if (!open) return;
    refresh();
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, refresh]);

  // Open on "Unread" when there's something new, otherwise show everything.
  const toggle = () => { if (!open) setView(unread ? "unread" : "all"); setOpen((o) => !o); };

  const items = (data?.items ?? []).filter((i) => view === "all" || isUnread(i));
  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={wrap} className="relative">
      <button ref={btn} type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog"
        aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"} title="Inbox"
        className={cx("relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900", open && "bg-zinc-100 text-zinc-900")}>
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10.5px] font-semibold leading-[18px] tabular text-white ring-2 ring-white" aria-hidden>{badge}</span>
        )}
      </button>

      {open && (
        <div id={panelId} role="dialog" aria-label="Inbox"
          className="fixed inset-x-3 top-[60px] z-50 flex max-h-[calc(100dvh-140px)] flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-[var(--shadow-pop)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-[420px] sm:max-h-[min(640px,calc(100dvh-80px))]">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-4 pt-3 pb-2">
            <h2 className="text-[14.5px] font-semibold text-zinc-900">Inbox</h2>
            {unread > 0 && <span className="rounded-full bg-zinc-100 px-1.5 text-[11.5px] font-medium tabular text-zinc-600">{unread} unread</span>}
            <button type="button" onClick={readAll} disabled={!unread}
              className="ml-auto rounded-md px-2 py-1 text-[12.5px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent">
              Mark all read
            </button>
          </div>
          <div role="tablist" aria-label="Show" className="flex gap-1 px-3 py-2 border-b border-zinc-100">
            {(["unread", "all"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={cx("h-7 rounded-md px-2.5 text-[12.5px] font-medium", view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100")}>
                {v === "unread" ? "Unread" : "All"}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {!data && !error && <p className="px-4 py-10 text-center text-[13px] text-zinc-500">Loading…</p>}
            {error && <p className="px-4 py-10 text-center text-[13px] text-rose-600" role="alert">{error}</p>}
            {data && !items.length && (
              <div className="px-6 py-10 text-center">
                <p className="text-[13.5px] font-medium text-zinc-900">{view === "unread" ? "You're all caught up" : "Nothing here yet"}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
                  {data.live ? "Calls that need attention and finished Automation reports show up here." : "The inbox needs the site's Vercel storage (Upstash Redis)."}
                </p>
              </div>
            )}
            {items.length > 0 && (
              <ul className="divide-y divide-zinc-100">
                {items.map((it) => <InboxRow key={it.id} it={it} compact unread={isUnread(it)} onOpen={(x) => { if (x.sample) setRead([x], true); setOpen(false); }} />)}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2">
            <Link href="/demo/inbox" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-[12.5px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900">Open inbox</Link>
            <Link href="/demo/automation" onClick={() => setOpen(false)} className="ml-auto rounded-md px-2 py-1 text-[12.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">Alert settings</Link>
          </div>
        </div>
      )}
    </div>
  );
}
