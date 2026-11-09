"use client";

import { useActionState, useState } from "react";
import { generateReport, type ReportState } from "./actions";
import { Button } from "@/components/ui";

function iso(d: Date) { return d.toISOString().slice(0, 10); }

export default function ReportForm({ slug, agents }: { slug: string; agents: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(generateReport, null);
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  const [to, setTo] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 0)));
  const presets: [string, () => [Date, Date]][] = [
    ["Last month", () => [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)]],
    ["This month", () => [new Date(now.getFullYear(), now.getMonth(), 1), now]],
    ["Last 7 days", () => [new Date(+now - 7 * 864e5), now]],
    ["Last 30 days", () => [new Date(+now - 30 * 864e5), now]],
    ["Last quarter", () => { const q = Math.floor(now.getMonth() / 3); return [new Date(now.getFullYear(), (q - 1) * 3, 1), new Date(now.getFullYear(), q * 3, 0)]; }],
  ];
  const input = "mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, fn]) => (
          <button type="button" key={label} onClick={() => { const [a, b] = fn(); setFrom(iso(a)); setTo(iso(b)); }}
            className="px-3 py-1.5 text-xs font-medium border border-line-strong text-dim hover:text-ink">{label}</button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <label className="block"><span className="eyebrow">From</span><input type="date" name="from" value={from} onChange={(e) => setFrom(e.target.value)} className={input} required /></label>
        <label className="block"><span className="eyebrow">To</span><input type="date" name="to" value={to} onChange={(e) => setTo(e.target.value)} className={input} required /></label>
        <label className="block"><span className="eyebrow">Agent</span>
          <select name="agent" className={input}><option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
        <label className="block"><span className="eyebrow">Title (optional)</span><input name="title" placeholder="September 2026 Report" className={input} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="narrative" value="on" defaultChecked /> Have Claude Opus 5.5 write the summary &amp; recommendations (~1 min). Unticked: a rule-based summary is used.</label>
      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Building report… this can take a minute" : "Generate report"}</Button>
    </form>
  );
}
