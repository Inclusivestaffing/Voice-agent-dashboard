"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReportCall } from "@/lib/reports/snapshot";
import { OUTCOME_LABEL, ROOT_CAUSE_LABEL, type Outcome, type RootCause } from "@/lib/types";
import { OutcomePill, SentimentText, cx, fmtDur } from "../ui";

const FILTERS: { id: string; label: string; match: (o: string | null) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "booked", label: "Booked", match: (o) => o === "booked" },
  { id: "transfer_ok", label: "Connected", match: (o) => o === "transfer_ok" },
  { id: "transfer_fail", label: "Failed", match: (o) => o === "transfer_fail" },
  { id: "lead_captured", label: "Leads", match: (o) => o === "lead_captured" },
  { id: "info", label: "Info", match: (o) => o === "info" },
  { id: "silent", label: "Silent", match: (o) => o === "silent" },
  { id: "spam", label: "Spam", match: (o) => o === "spam" || o === "abusive" },
];

export default function ReportCallTable({ calls, timezone, agentName, print }: { calls: ReportCall[]; timezone: string; agentName: string; print?: boolean }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const rows = useMemo(() => calls.filter((c) => FILTERS.find((f) => f.id === filter)!.match(c.outcome)), [calls, filter]);
  const current = open === null ? null : rows.find((c) => c.n === open) ?? null;
  const idx = current ? rows.indexOf(current) : -1;

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight" && idx < rows.length - 1) setOpen(rows[idx + 1].n);
      if (e.key === "ArrowLeft" && idx > 0) setOpen(rows[idx - 1].n);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, idx, rows]);

  const time = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "—";

  return (
    <>
      {!print && (
        <div className="flex gap-1 flex-wrap mb-3" role="group" aria-label="Filter calls">
          {FILTERS.map((f) => {
            const n = calls.filter((c) => f.match(c.outcome)).length;
            if (!n && f.id !== "all") return null;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                className={cx("px-3 py-1.5 text-[10px] font-mono font-bold uppercase border", filter === f.id ? "bg-brand border-brand text-black" : "border-line-strong text-dim")}>
                {f.label} {n}
              </button>
            );
          })}
        </div>
      )}
      <div className="border border-line overflow-x-auto">
        <table className="w-full text-[12px] min-w-[720px]">
          <thead className="bg-surface-2"><tr className="text-left">
            {["#", "Time", "Caller / reason", "Number", "Outcome", "Duration", "Mood"].map((h) => <th key={h} className="px-3 py-2.5 eyebrow border-b-2 border-ink">{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.n} onClick={() => !print && setOpen(c.n)} className={cx("border-b border-line align-top", !print && "cursor-pointer hover:bg-brand-glow")}>
              <td className="px-3 py-2.5 font-mono text-dim">{c.n}</td>
              <td className="px-3 py-2.5 font-mono text-dim whitespace-nowrap">{time(c.time)}</td>
              <td className="px-3 py-2.5"><b>{c.caller}</b><div className="text-dim mt-0.5">{c.reason}</div></td>
              <td className="px-3 py-2.5 font-mono text-dim whitespace-nowrap">{c.phone ?? "—"}</td>
              <td className="px-3 py-2.5"><OutcomePill outcome={c.outcome} /></td>
              <td className="px-3 py-2.5 font-mono text-right">{fmtDur(c.dur_s)}</td>
              <td className="px-3 py-2.5"><SentimentText s={c.sentiment} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {current && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={`Call #${current.n}`}>
          <div className="bg-surface w-full max-w-3xl max-h-[92dvh] sm:max-h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-none shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b-2 border-ink">
              <h3 className="text-lg font-extrabold">Call #{current.n}: {current.caller}</h3>
              <div className="text-[11px] font-mono uppercase text-dim mt-1">{time(current.time)} · {current.phone ?? "—"} · {OUTCOME_LABEL[current.outcome as Outcome] ?? "—"} · {fmtDur(current.dur_s)}</div>
            </div>
            <div className="overflow-y-auto p-5 flex-1">
              <div className="eyebrow border-b border-line pb-2 mb-2">What the AI found</div>
              <div className="bg-brand-wash border-l-[3px] border-brand px-4 py-3 text-[13px] leading-relaxed mb-3">{current.summary || "No summary."}</div>
              {current.root_cause && current.root_cause !== "none" && <div className="text-[12px] mb-2"><b>Main issue:</b> {ROOT_CAUSE_LABEL[current.root_cause as RootCause] ?? current.root_cause}</div>}
              {current.what_failed.length > 0 && <ul className="text-[12px] mb-4 space-y-1">{current.what_failed.map((w, i) => <li key={i} className="text-bad">▲ {w}</li>)}</ul>}
              {current.what_worked.length > 0 && <ul className="text-[12px] mb-4 space-y-1">{current.what_worked.map((w, i) => <li key={i} className="text-good">✓ {w}</li>)}</ul>}
              <div className="eyebrow border-b border-line pb-2 mb-3">Full conversation</div>
              <div className="flex flex-col gap-2">
                {current.transcript ? current.transcript.split("\n").filter(Boolean).map((line, i) => {
                  const agent = /^(Agent|Assistant):/.test(line);
                  const text = line.replace(/^(Agent|User|Assistant):\s*/, "");
                  return (
                    <div key={i} className={cx("max-w-[88%] px-3 py-2 text-[13px] leading-relaxed", agent ? "self-start bg-brand-wash border-l-2 border-brand" : "self-end bg-surface-3 border-r-2 border-dim")}>
                      <div className="text-[9px] font-mono font-bold uppercase text-dim mb-0.5">{agent ? `AI Agent${agentName ? ` (${agentName})` : ""}` : "Caller"}</div>{text}
                    </div>
                  );
                }) : <p className="text-center text-muted font-mono text-xs py-8">No transcript available for this call</p>}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-px bg-line border-t border-line">
              <button disabled={idx <= 0} onClick={() => setOpen(rows[idx - 1].n)} className="bg-surface py-3.5 text-[11px] font-mono font-bold uppercase text-dim disabled:opacity-40">← Prev</button>
              <button onClick={() => setOpen(null)} className="bg-[#0b0b0b] text-[#facc15] py-3.5 text-[11px] font-mono font-bold uppercase">Close</button>
              <button disabled={idx >= rows.length - 1} onClick={() => setOpen(rows[idx + 1].n)} className="bg-surface py-3.5 text-[11px] font-mono font-bold uppercase text-dim disabled:opacity-40">Next →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
