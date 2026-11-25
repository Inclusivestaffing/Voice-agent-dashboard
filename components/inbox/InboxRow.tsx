"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { REASON_LABEL, type InboxEntry } from "@/lib/inbox/types";

const SEV: Record<InboxEntry["severity"], { ring: string; icon: string; label: string }> = {
  critical: { ring: "bg-rose-50 text-rose-600 ring-rose-200/70", icon: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", label: "Critical" },
  high: { ring: "bg-amber-50 text-amber-600 ring-amber-200/70", icon: "M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z", label: "High" },
  medium: { ring: "bg-zinc-100 text-zinc-600 ring-zinc-200", icon: "M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z", label: "Medium" },
  info: { ring: "bg-sky-50 text-sky-600 ring-sky-200/70", icon: "M9 12l2 2 4-4M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z", label: "Info" },
};
const REPORT_ICON = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8";

/** "5m", "3h", "2d", or a date. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The current time, only after mounting: relative times and local dates differ between server and browser. */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** One inbox item: what happened, which workspace, when, and the suggested fix. The whole row is the link. */
export default function InboxRow({ it, unread, onOpen, onToggleRead, compact = false }: {
  it: InboxEntry; unread: boolean; onOpen?: (it: InboxEntry) => void; onToggleRead?: (it: InboxEntry) => void; compact?: boolean;
}) {
  const sev = SEV[it.severity];
  const now = useNow();
  // Call alerts show when the call happened (catch-up alerts can arrive a day later).
  const at = it.callAt ?? it.created_at;
  return (
    <li className="group relative">
      <a href={it.href} onClick={() => onOpen?.(it)}
        className={cx("flex gap-3 px-4 py-3 transition-colors duration-150 hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-offset-[-2px]", unread && "bg-white")}>
        <span className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1", it.kind === "digest" ? "bg-brand-wash text-brand-ink ring-amber-200/70" : sev.ring)} aria-hidden>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={it.kind === "digest" ? REPORT_ICON : sev.icon} /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cx("min-w-0 flex-1 truncate text-[13.5px] leading-snug", unread ? "font-semibold text-zinc-900" : "font-medium text-zinc-700")}>{it.title}</span>
            <time dateTime={at} className="shrink-0 min-w-[2ch] text-right text-[11.5px] tabular text-zinc-400" title={now == null ? undefined : `${it.callAt ? "Call at " : ""}${new Date(at).toLocaleString()}`}>{now == null ? "" : ago(at, now)}</time>
            {unread && <span className="h-2 w-2 shrink-0 self-center rounded-full bg-sky-500" aria-label="Unread" />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-zinc-500">
            <span className="font-medium text-zinc-600">{it.wsName}</span>
            {it.sample && <span className="rounded bg-zinc-100 px-1 py-px text-[10.5px] font-medium text-zinc-500">Sample</span>}
            {it.kind === "call" && it.reasons.length > 1 && <span aria-hidden>·</span>}
            {it.kind === "call" && it.reasons.length > 1 && <span>{it.reasons.map((r) => (r === "low_quality" && it.score != null ? `Quality ${it.score}` : REASON_LABEL[r])).join(", ")}</span>}
            <span className="sr-only">Severity: {sev.label}</span>
          </span>
          <span className={cx("mt-1 block text-[12.5px] leading-relaxed text-zinc-600", compact ? "line-clamp-2" : "line-clamp-3")}>{it.detail}</span>
          {it.fix && (
            <span className={cx("mt-1 block text-[12.5px] leading-relaxed text-zinc-500", compact ? "line-clamp-1" : "line-clamp-2")}>
              <span className="font-medium text-emerald-700">Fix: </span>{it.fix}
            </span>
          )}
        </span>
      </a>
      {onToggleRead && (
        <button type="button" onClick={() => onToggleRead(it)}
          className="absolute right-3 bottom-2.5 hidden rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-zinc-600 shadow-2xs hover:text-zinc-900 group-hover:block group-focus-within:block focus-visible:block">
          {unread ? "Mark read" : "Mark unread"}
        </button>
      )}
    </li>
  );
}
