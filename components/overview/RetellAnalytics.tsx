import { Suspense } from "react";
import { timeSeries, breakdownTotals, METRICS, summarize, type AnalyticsCall, type Bucket, type Dimension, type Measure } from "@/lib/metrics/aggregate";
import { SENTIMENT_COLOR } from "@/lib/colors";
import Chart, { type ChartSeries } from "@/components/charts/Chart";
import { Card, fmtDur, fmtMs, humanize } from "@/components/ui";
import AnalyticsControls from "./AnalyticsControls";

/** Breakdown options exactly as in Retell's dashboard-level "Breakdown" menu. */
export const RETELL_BREAKDOWNS: { id: string; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "agent_version", label: "Agent Version" },
  { id: "disconnection_reason", label: "Disconnection Reason" },
  { id: "call_status", label: "Call Status" },
  { id: "call_successful", label: "Call Successful" },
  { id: "call_type", label: "Call Type" },
];

export function parseBreakdown(v: string | undefined, customKeys: string[]): Dimension | undefined {
  if (!v) return undefined;
  if (RETELL_BREAKDOWNS.some((b) => b.id === v)) return v as Dimension;
  if (v.startsWith("custom:") && customKeys.includes(v.slice(7))) return v as Dimension;
  return undefined;
}

/**
 * Mirrors Retell's default Call Dashboard, chart for chart and in the same order:
 *  1. Call Counts · Call Duration · Call Latency (numbers)
 *  2. Call Counts (column over time) · Concurrency Used
 *  3. Call Successful · Disconnection Reason · User Sentiment · Phone inbound/outbound (donuts)
 *  4. Call Picked Up Rate · Call Successful Rate · Call Transfer Rate (over time)
 *  5. Voicemail Rate · Average call duration · Average Latency (over time)
 *  6. Disconnection Reason (column over time) · Call Picked Up Rate · Call Transfer Rate (bar by agent)
 * plus the dashboard-wide Breakdown, Hour/Day/Week/Month buckets and previous-period comparison.
 */
export default function RetellAnalytics({ calls, prevCalls, range, prevRange, timezone, bucket, compare, breakdown, customKeys = [] }: {
  calls: AnalyticsCall[]; prevCalls: AnalyticsCall[]; range: { from: string; to: string }; prevRange: { from: string; to: string };
  timezone: string; bucket: Bucket; compare: boolean; breakdown?: Dimension; customKeys?: string[];
}) {
  const m = (id: string) => METRICS.find((x) => x.id === id)!;
  const s = summarize(calls, { timezone });
  const x = timeSeries(calls, m("call_count"), "count", bucket, range, timezone).x;
  const labels = x.map((k) => (bucket === "month" ? k : k.slice(5)));
  const prettyName = (n: string) => (breakdown === "call_successful" || breakdown === "agent_version" ? n : humanize(n));

  /** A metric over time; split by the dashboard breakdown when set, else with optional previous-period overlay. */
  const over = (id: string, measure: Measure, color = "--s1"): ChartSeries[] => {
    if (breakdown) {
      return timeSeries(calls, m(id), measure, bucket, range, timezone, breakdown).series.map((sr) => ({ name: prettyName(sr.name), data: sr.data }));
    }
    const cur: ChartSeries = { name: m(id).label, data: timeSeries(calls, m(id), measure, bucket, range, timezone).series[0]?.data ?? [], color };
    if (!compare) return [cur];
    const d = timeSeries(prevCalls, m(id), measure, bucket, prevRange, timezone).series[0]?.data ?? [];
    return [cur, { name: "Previous period", data: x.map((_, i) => d[i] ?? null), compare: true }];
  };
  const groupedOverTime = (dim: Dimension) =>
    timeSeries(calls, m("call_count"), "count", bucket, range, timezone, dim).series.map((sr) => ({ name: humanize(sr.name), data: sr.data }));
  const byAgent = (id: string) => breakdownTotals(calls, m(id), "avg", breakdown ?? "agent");

  const donut = (dim: Dimension, colors?: (k: string) => string | undefined) => {
    const rows = breakdownTotals(calls, m("call_count"), "count", dim).slice(0, 8);
    return { categories: rows.map((r) => (dim === "user_sentiment" ? r.name : humanize(r.name))), data: rows.map((r) => r.value), colors: colors ? rows.map((r) => colors(r.name) ?? "--neutral-1") : undefined };
  };
  const successD = donut("call_successful", (k) => (k === "Successful" ? "--status-good" : k === "Unsuccessful" ? "--status-critical" : "--neutral-2"));
  const discD = donut("disconnection_reason");
  const sentD = donut("user_sentiment", (k) => SENTIMENT_COLOR[k]);
  const dirD = donut("direction", (k) => (k === "inbound" ? "--s1" : k === "outbound" ? "--s2" : "--neutral-1"));
  const statusD = donut("call_status", (k) => (k === "ended" ? "--s3" : k === "error" ? "--status-critical" : "--neutral-1"));
  const sub = breakdown ? `By ${RETELL_BREAKDOWNS.find((b) => b.id === breakdown)?.label ?? humanize(breakdown.replace("custom:", ""))}` : `Per ${bucket}`;

  const Big = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-card">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="mt-3 bg-slate-50/80 border border-slate-100 rounded-xl py-8 text-center text-[32px] font-bold text-slate-900 tabular tracking-wide">{value}</div>
    </div>
  );

  return (
    <section aria-labelledby="retell-analytics" className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 id="retell-analytics" className="section-title">Retell analytics · Call Dashboard</h2>
          <p className="text-xs text-muted mt-1.5">Same charts, order, metrics and breakdowns as Retell&apos;s default Call Dashboard, calculated from your call records.</p>
        </div>
        <Suspense><AnalyticsControls bucket={bucket} compare={compare} breakdown={breakdown ?? ""} breakdowns={[...RETELL_BREAKDOWNS, ...customKeys.map((k) => ({ id: `custom:${k}`, label: `Post Call Extraction: ${humanize(k)}` }))]} /></Suspense>
      </div>

      {/* Row 1 — numbers */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Big label="Call Counts" value={s.total.toLocaleString()} />
        <Big label="Call Duration" value={s.duration_s.avg == null ? "0s" : fmtDur(s.duration_s.avg)} />
        <Big label="Call Latency" value={s.e2e_latency_ms.avg == null ? "0ms" : fmtMs(s.e2e_latency_ms.avg)} />
      </div>

      {/* Row 2 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Call Counts" sub={sub} className="lg:col-span-2">
          <Chart kind={breakdown ? "stacked" : "column"} labels="none" ariaLabel="Call counts over time" categories={labels} series={over("call_count", "count")} />
        </Card>
        <Card title="Concurrency Used" sub="Max simultaneous calls">
          <Chart kind="line" ariaLabel="Concurrency used over time" categories={labels} series={over("concurrency", "max")} />
        </Card>
      </div>

      {/* Row 3 — grouped metrics as donuts */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Call Successful"><Chart kind="donut" height={300} legendPosition="bottom" ariaLabel="Call successful" categories={successD.categories} series={[{ name: "Calls", data: successD.data }]} sliceColors={successD.colors} /></Card>
        <Card title="Disconnection Reason"><Chart kind="donut" height={300} legendPosition="bottom" ariaLabel="Disconnection reason" categories={discD.categories} series={[{ name: "Calls", data: discD.data }]} /></Card>
        <Card title="User Sentiment"><Chart kind="donut" height={300} legendPosition="bottom" ariaLabel="User sentiment" categories={sentD.categories} series={[{ name: "Calls", data: sentD.data }]} sliceColors={sentD.colors} /></Card>
        <Card title="Phone inbound/outbound"><Chart kind="donut" height={300} legendPosition="bottom" ariaLabel="Phone inbound and outbound" categories={dirD.categories} series={[{ name: "Calls", data: dirD.data }]} sliceColors={dirD.colors} /></Card>
      </div>

      {/* Row 4 — rates over time */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Call Picked Up Rate" sub={sub}><Chart kind="line" unit="%" ariaLabel="Call picked up rate" categories={labels} series={over("picked_up_rate", "avg", "--s1")} /></Card>
        <Card title="Call Successful Rate" sub={sub}><Chart kind="line" unit="%" ariaLabel="Call successful rate" categories={labels} series={over("retell_success_rate", "avg", "--s3")} /></Card>
        <Card title="Call Transfer Rate" sub={sub}><Chart kind="line" unit="%" ariaLabel="Call transfer rate" categories={labels} series={over("transfer_rate", "avg", "--s7")} /></Card>
      </div>

      {/* Row 5 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Voicemail Rate" sub={sub}><Chart kind="line" unit="%" ariaLabel="Voicemail rate" categories={labels} series={over("voicemail_rate", "avg", "--s4")} /></Card>
        <Card title="Average call duration" sub={sub}><Chart kind="line" unit="s" ariaLabel="Average call duration" categories={labels} series={over("duration", "avg", "--s1")} /></Card>
        <Card title="Average Latency" sub={`${sub} · end-to-end, p50 per call`}><Chart kind="line" unit="ms" ariaLabel="Average latency" categories={labels} series={over("e2e_latency", "avg", "--s2")} /></Card>
      </div>

      {/* Row 6 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Disconnection Reason" sub={`Per ${bucket}`}>
          <Chart kind="stacked" labels="none" ariaLabel="Disconnection reason over time" categories={labels} series={groupedOverTime("disconnection_reason")} />
        </Card>
        <Card title="Call Picked Up Rate" sub={`By ${breakdown ? RETELL_BREAKDOWNS.find((b) => b.id === breakdown)?.label ?? "group" : "agent"}`}>
          <Chart kind="bar" unit="%" ariaLabel="Call picked up rate by agent" categories={byAgent("picked_up_rate").map((r) => prettyName(r.name))} series={[{ name: "Picked up", data: byAgent("picked_up_rate").map((r) => r.value), color: "--s1" }]} />
        </Card>
        <Card title="Call Transfer Rate" sub={`By ${breakdown ? RETELL_BREAKDOWNS.find((b) => b.id === breakdown)?.label ?? "group" : "agent"}`}>
          <Chart kind="bar" unit="%" ariaLabel="Call transfer rate by agent" categories={byAgent("transfer_rate").map((r) => prettyName(r.name))} series={[{ name: "Transferred", data: byAgent("transfer_rate").map((r) => r.value), color: "--s7" }]} />
        </Card>
      </div>

      {/* Other Retell metrics available in its chart builder */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Combined cost" sub={`Sum · ${sub.toLowerCase()}`} className="lg:col-span-2">
          <Chart kind={breakdown ? "stacked" : "column"} unit="$" labels="none" ariaLabel="Combined cost over time" categories={labels} series={over("cost", "sum")} />
        </Card>
        <Card title="Call Status"><Chart kind="donut" height={300} legendPosition="bottom" ariaLabel="Call status" categories={statusD.categories} series={[{ name: "Calls", data: statusD.data }]} sliceColors={statusD.colors} /></Card>
      </div>
    </section>
  );
}
