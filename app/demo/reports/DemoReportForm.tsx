"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

const PRESETS: [string, string, string][] = [
  ["Whole sample (Aug 27 – Sep 30)", "2026-08-27", "2026-09-30"],
  ["September 2026", "2026-09-01", "2026-09-30"],
  ["Last week of August", "2026-08-27", "2026-08-31"],
  ["Sep 1 – 15", "2026-09-01", "2026-09-15"],
  ["Sep 16 – 30", "2026-09-16", "2026-09-30"],
];

export default function DemoReportForm() {
  const router = useRouter();
  const [from, setFrom] = useState("2026-08-27");
  const [to, setTo] = useState("2026-09-30");
  const [version, setVersion] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const input = "mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || from > to) { setErr("Pick a valid start and end date."); return; }
    setErr("");
    const p = new URLSearchParams({ range: "custom", from, to });
    if (version) p.set("version", version);
    start(() => router.push(`/demo/reports/view?${p}`));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([label, a, b]) => (
          <button type="button" key={label} onClick={() => { setFrom(a); setTo(b); }} aria-pressed={from === a && to === b}
            className={`px-3 py-1.5 text-xs font-medium border ${from === a && to === b ? "bg-ink border-ink text-white" : "border-line-strong text-dim hover:text-ink"}`}>{label}</button>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="block"><span className="eyebrow">From</span><input type="date" value={from} min="2026-08-27" max="2026-09-30" onChange={(e) => setFrom(e.target.value)} className={input} required /></label>
        <label className="block"><span className="eyebrow">To</span><input type="date" value={to} min="2026-08-27" max="2026-09-30" onChange={(e) => setTo(e.target.value)} className={input} required /></label>
        <label className="block"><span className="eyebrow">Agent version</span>
          <select value={version} onChange={(e) => setVersion(e.target.value)} className={input}>
            <option value="">All versions</option><option value="allen:4">Allen v4</option><option value="allen:5">Allen v5</option>
          </select>
        </label>
      </div>
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Building report…" : "Generate report"}</Button>
    </form>
  );
}
