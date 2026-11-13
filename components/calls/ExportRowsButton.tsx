"use client";

import { useCallback, useEffect } from "react";
import type { CallHistoryRow } from "./CallHistoryTable";
import { EXPORT_EVENT } from "@/components/command/CommandPalette";
import { toast } from "@/components/feedback/Toaster";

const COLS: [string, (r: CallHistoryRow) => unknown][] = [
  ["Call ID", (r) => r.call_id],
  ["Start time (UTC)", (r) => r.start_ts],
  ["Duration (s)", (r) => (r.duration_ms == null ? "" : Math.round(r.duration_ms / 1000))],
  ["Agent", (r) => r.agent_name],
  ["Version", (r) => r.agent_version],
  ["Type", (r) => r.call_type],
  ["Direction", (r) => r.direction],
  ["From", (r) => r.from_number],
  ["To", (r) => r.to_number],
  ["Status", (r) => r.call_status],
  ["Disconnection reason", (r) => r.disconnection_reason],
  ["Sentiment", (r) => r.user_sentiment],
  ["Call successful", (r) => r.call_successful],
  ["Latency p50 (ms)", (r) => r.e2e_p50_ms],
  ["Cost ($)", (r) => (r.combined_cost_cents == null ? "" : (r.combined_cost_cents / 100).toFixed(2))],
  ["AI outcome", (r) => r.outcome],
  ["Root cause", (r) => r.primary_root_cause],
  ["AI score", (r) => r.overall_score],
  ["Caller intent", (r) => r.intent],
];

function cell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula-injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exports exactly the calls on screen (current filters and sort) as CSV, in the browser. */
export default function ExportRowsButton({ rows, name = "calls" }: { rows: CallHistoryRow[]; name?: string }) {
  const run = useCallback(() => {
    const csv = [COLS.map(([h]) => h), ...rows.map((r) => COLS.map(([, f]) => f(r)))].map((r) => r.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${name}-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${rows.length} calls`);
  }, [rows, name]);

  // The command palette's "Export these calls" action.
  useEffect(() => {
    window.addEventListener(EXPORT_EVENT, run);
    return () => window.removeEventListener(EXPORT_EVENT, run);
  }, [run]);

  return (
    <button type="button" onClick={run} disabled={!rows.length}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></svg>
      Export CSV
    </button>
  );
}
