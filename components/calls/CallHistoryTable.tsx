"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CallDrawer from "./CallDrawer";
import { OutcomePill, RootCauseTag, SentimentText, cx, fmtDur, fmtMoney, fmtMs, humanize } from "../ui";

export interface CallHistoryRow {
  call_id: string;
  start_ts: string | null;
  duration_ms: number | null;
  call_type: string | null;
  direction: string | null;
  combined_cost_cents: number | null;
  disconnection_reason: string | null;
  call_status: string | null;
  user_sentiment: string | null;
  from_number: string | null;
  to_number: string | null;
  call_successful: boolean | null;
  e2e_p50_ms: number | null;
  agent_name: string | null;
  agent_version: number | null;
  batch_call_id: string | null;
  outcome: string | null;
  primary_root_cause: string | null;
  overall_score: number | null;
  intent: string | null;
}

type Col = { id: string; label: string; sort?: string; align?: "right"; defaultOn: boolean; group: "Retell" | "AI analysis"; render: (r: CallHistoryRow, tz: string) => React.ReactNode };

const time = (iso: string | null, tz: string) => iso ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "—";

/** Retell Call History columns (same names), followed by our AI-analysis columns. */
const COLUMNS: Col[] = [
  { id: "time", label: "Time", sort: "start_ts", defaultOn: true, group: "Retell", render: (r, tz) => <span className="text-xs text-dim whitespace-nowrap">{time(r.start_ts, tz)}</span> },
  { id: "agent", label: "Agent", defaultOn: true, group: "Retell", render: (r) => <span className="whitespace-nowrap">{r.agent_name ?? "—"}{r.agent_version != null && <span className="text-xs text-muted"> v{r.agent_version}</span>}</span> },
  { id: "duration", label: "Duration", sort: "duration_ms", align: "right", defaultOn: true, group: "Retell", render: (r) => <span className="tabular">{fmtDur(r.duration_ms == null ? null : r.duration_ms / 1000)}</span> },
  { id: "channel", label: "Channel Type", defaultOn: true, group: "Retell", render: (r) => <span className="whitespace-nowrap">{r.call_type === "web_call" ? "Web call" : r.call_type === "phone_call" ? "Phone call" : "—"}</span> },
  { id: "direction", label: "Direction", defaultOn: false, group: "Retell", render: (r) => humanize(r.direction ?? "—") },
  { id: "cost", label: "Cost", sort: "combined_cost_cents", align: "right", defaultOn: true, group: "Retell", render: (r) => <span className="tabular text-dim">{fmtMoney(r.combined_cost_cents)}</span> },
  { id: "session", label: "Session ID", defaultOn: true, group: "Retell", render: (r) => <span className="text-xs text-dim" title={r.call_id}>{r.call_id.slice(0, 10)}…</span> },
  { id: "end_reason", label: "End Reason", sort: "disconnection_reason", defaultOn: true, group: "Retell", render: (r) => <span className="whitespace-nowrap">{humanize(r.disconnection_reason ?? "—")}</span> },
  { id: "status", label: "Session Status", defaultOn: true, group: "Retell", render: (r) => <StatusDot status={r.call_status} /> },
  { id: "sentiment", label: "User Sentiment", sort: "user_sentiment", defaultOn: true, group: "Retell", render: (r) => <SentimentText s={r.user_sentiment} /> },
  { id: "from", label: "From", sort: "from_number", defaultOn: true, group: "Retell", render: (r) => <span className="text-xs text-dim whitespace-nowrap">{r.from_number ?? "—"}</span> },
  { id: "to", label: "To", defaultOn: false, group: "Retell", render: (r) => <span className="text-xs text-dim whitespace-nowrap">{r.to_number ?? "—"}</span> },
  { id: "outcome_retell", label: "Session Outcome", defaultOn: true, group: "Retell", render: (r) => r.call_successful == null ? <span className="text-muted">—</span> : <span className={r.call_successful ? "text-good font-semibold" : "text-bad font-semibold"}>{r.call_successful ? "Successful" : "Unsuccessful"}</span> },
  { id: "latency", label: "End to End Latency", sort: "e2e_p50_ms", align: "right", defaultOn: true, group: "Retell", render: (r) => <span className={cx(" tabular", (r.e2e_p50_ms ?? 0) > 1500 && "text-bad font-medium")}>{fmtMs(r.e2e_p50_ms)}</span> },
  { id: "batch", label: "Batch Call ID", defaultOn: false, group: "Retell", render: (r) => <span className="text-xs text-dim">{r.batch_call_id ?? "—"}</span> },
  { id: "intent", label: "Caller wanted", defaultOn: true, group: "AI analysis", render: (r) => <span className="block max-w-[260px] truncate font-medium" title={r.intent ?? ""}>{r.intent ?? "—"}</span> },
  { id: "ai_outcome", label: "AI Outcome", defaultOn: true, group: "AI analysis", render: (r) => <OutcomePill outcome={r.outcome} /> },
  { id: "root_cause", label: "Root Cause", defaultOn: false, group: "AI analysis", render: (r) => <RootCauseTag cause={r.primary_root_cause} /> },
  { id: "score", label: "AI Score", align: "right", defaultOn: true, group: "AI analysis", render: (r) => <span className={cx(" tabular font-medium", r.overall_score != null && r.overall_score < 50 && "text-bad")}>{r.overall_score ?? "—"}</span> },
];

const STORAGE_KEY = "callHistory.columns.v1";

function StatusDot({ status }: { status: string | null }) {
  const color = status === "ended" ? "bg-[var(--status-good)]" : status === "error" ? "bg-bad" : status === "ongoing" ? "bg-[var(--status-warning)]" : "bg-[var(--neutral-1)]";
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={cx("w-2 h-2 rounded-full", color)} />{humanize(status ?? "—")}</span>;
}

export default function CallHistoryTable({ rows, timezone, detailBase, navQuery, sortBase, sort, dir, drawerApi }: {
  rows: CallHistoryRow[]; timezone: string; detailBase: string; navQuery: string; sortBase: string; sort: string; dir: "asc" | "desc";
  /** Endpoint the slide-over loads call details from, e.g. "/api/demo/calls". */
  drawerApi: string;
}) {
  // The open call lives in the URL (?call=…) so it survives refresh and can be shared. Changing it
  // uses the History API directly, which Next keeps in sync without a server round trip.
  const sp = useSearchParams();
  const openId = sp.get("call");
  const setCall = useCallback((id: string | null, mode: "push" | "replace" = "push") => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("call", id); else u.searchParams.delete("call");
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", u.toString());
  }, []);
  const openCall = (e: React.MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // new tab: full page
    e.preventDefault();
    setCall(id, openId ? "replace" : "push");
  };
  const ids = rows.map((r) => r.call_id);
  const [visible, setVisible] = useState<string[]>(() => COLUMNS.filter((c) => c.defaultOn).map((c) => c.id));
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (Array.isArray(saved) && saved.every((x) => typeof x === "string")) setVisible(saved.filter((id) => COLUMNS.some((c) => c.id === id)));
    } catch { /* storage unavailable: keep defaults */ }
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) => {
    const next = visible.includes(id) ? visible.filter((v) => v !== id) : COLUMNS.filter((c) => c.id === id || visible.includes(c.id)).map((c) => c.id);
    setVisible(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const cols = COLUMNS.filter((c) => visible.includes(c.id));
  const href = (id: string) => `${detailBase}/${encodeURIComponent(id)}${navQuery ? `?${navQuery}` : ""}`;
  const sortHref = (key: string) => {
    const n = new URLSearchParams(sortBase);
    n.set("sort", key); n.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `?${n}`;
  };

  return (
    <>
      <div className="flex justify-end mb-2.5 relative" ref={popRef}>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 transition">
          <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Customize fields
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-zinc-200 rounded-xl shadow-pop p-4 w-72 max-h-[420px] overflow-y-auto">
            {(["Retell", "AI analysis"] as const).map((g) => (
              <fieldset key={g} className="mb-3">
                <legend className="text-[11px] font-semibold text-zinc-500 mb-2">{g === "Retell" ? "Retell fields" : "AI analysis"}</legend>
                {COLUMNS.filter((c) => c.group === g).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-0.5 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={visible.includes(c.id)} onChange={() => toggle(c.id)} className="accent-ink" />{c.label}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto border border-zinc-200/70 rounded-xl bg-white shadow-card">
        <table className="w-full text-[13px]">
          <thead className="bg-zinc-50/90">
            <tr>
              {cols.map((c) => (
                <th key={c.id} scope="col" className={cx("text-left px-3.5 py-3 border-b border-zinc-200 text-xs font-semibold text-zinc-500 whitespace-nowrap", c.align === "right" && "text-right")}>
                  {c.sort ? <Link href={sortHref(c.sort)} className="hover:text-zinc-900 transition">{c.label}{sort === c.sort ? (dir === "asc" ? " ↑" : " ↓") : ""}</Link> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.call_id} aria-selected={openId === r.call_id} className={cx("border-b border-zinc-100 hover:bg-zinc-50/80 transition-colors align-middle relative", openId === r.call_id && "bg-zinc-50")}>
                {cols.map((c, i) => (
                  <td key={c.id} className={cx("px-3.5 py-3 text-zinc-700", c.align === "right" && "text-right")}>
                    {i === 0 ? <Link href={href(r.call_id)} onClick={(e) => openCall(e, r.call_id)} className="font-medium text-zinc-900 after:absolute after:inset-0 after:cursor-pointer">{c.render(r, timezone)}</Link> : c.render(r, timezone)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden border border-zinc-200/70 rounded-xl bg-white divide-y divide-zinc-100 shadow-card overflow-hidden">
        {rows.map((r) => (
          <Link key={r.call_id} href={href(r.call_id)} onClick={(e) => openCall(e, r.call_id)} className="flex justify-between gap-3 p-4 active:bg-surface-2">
            <div className="min-w-0">
              <div className="flex gap-2 items-center flex-wrap"><OutcomePill outcome={r.outcome} /><StatusDot status={r.call_status} /></div>
              <div className="font-medium mt-1.5 truncate">{r.intent || humanize(r.disconnection_reason ?? "")}</div>
              <div className="text-xs text-dim mt-1">{r.from_number ?? (r.call_type === "web_call" ? "Web call" : "—")}</div>
              <div className="flex gap-3 mt-2 text-xs text-muted flex-wrap">
                <span>{time(r.start_ts, timezone)}</span><span>{fmtDur(r.duration_ms == null ? null : r.duration_ms / 1000)}</span><SentimentText s={r.user_sentiment} />
              </div>
            </div>
            <span className="text-muted">→</span>
          </Link>
        ))}
      </div>
      {openId && (
        <CallDrawer
          callId={openId}
          apiBase={drawerApi}
          fullHref={href}
          timezone={timezone}
          ids={ids}
          onNavigate={(id) => setCall(id, "replace")}
          onClose={() => setCall(null, "replace")}
        />
      )}
    </>
  );
}
