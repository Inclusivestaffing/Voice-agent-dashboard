"use client";

import { useState, useTransition } from "react";
import { addDashboardChart, deleteDashboardChart } from "@/app/actions";
import { METRIC_OPTIONS, DIMENSION_OPTIONS } from "@/lib/charts";
import { Button } from "../ui";

export function ChartBuilder({ workspaceId, customKeys }: { workspaceId: string; customKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [metric, setMetric] = useState("call_count");
  const m = METRIC_OPTIONS.find((x) => x.id === metric)!;
  const [measure, setMeasure] = useState(m.measures[0]);
  const [kind, setKind] = useState("column");
  const [bucket, setBucket] = useState("auto");
  const [breakdown, setBreakdown] = useState("");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");

  const dims = [...DIMENSION_OPTIONS, ...customKeys.map((k) => ({ id: `custom:${k}`, label: `Post-call: ${k}` }))];
  const sel = "mt-1 w-full border border-line-strong bg-surface px-2 py-1.5 text-xs rounded-xl";

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>+ Add chart</Button>;
  return (
    <div className="bg-surface border border-ink p-4 w-full rounded-2xl">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <label className="text-xs eyebrow">Metric
          <select className={sel} value={metric} onChange={(e) => { setMetric(e.target.value); setMeasure(METRIC_OPTIONS.find((x) => x.id === e.target.value)!.measures[0]); }}>
            {METRIC_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs eyebrow">Measure
          <select className={sel} value={measure} onChange={(e) => setMeasure(e.target.value as typeof measure)}>
            {m.measures.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-xs eyebrow">Chart type
          <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="column">Column</option><option value="bar">Bar</option><option value="line">Line</option>
            <option value="stacked">Stacked column</option><option value="donut">Donut</option><option value="number">Number</option>
          </select>
        </label>
        <label className="text-xs eyebrow">Time bucket
          <select className={sel} value={bucket} onChange={(e) => setBucket(e.target.value)} disabled={kind === "donut" || kind === "number"}>
            <option value="auto">Auto</option><option value="hour">Hour</option><option value="day">Day</option>
            <option value="week">Week</option><option value="month">Month</option><option value="none">No time axis (totals)</option>
          </select>
        </label>
        <label className="text-xs eyebrow">Breakdown
          <select className={sel} value={breakdown} onChange={(e) => setBreakdown(e.target.value)} disabled={kind === "number"}>
            <option value="">None</option>
            {dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label className="text-xs eyebrow">Title
          <input className={sel} value={title} placeholder={m.label} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      {err && <p className="text-bad text-xs mt-2">{err}</p>}
      <div className="flex gap-2 mt-4">
        <Button disabled={pending} onClick={() => start(async () => {
          try {
            await addDashboardChart(workspaceId, title || `${m.label}${measure !== "count" ? ` (${measure})` : ""}`, {
              metric, measure, kind, bucket: bucket === "auto" ? undefined : bucket, breakdown,
            });
            setOpen(false); setTitle(""); setErr("");
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        })}>Save chart</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function DeleteChartButton({ workspaceId, id }: { workspaceId: string; id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => deleteDashboardChart(workspaceId, id))}
      className="text-xs text-muted hover:text-bad" aria-label="Remove chart">Remove</button>
  );
}
