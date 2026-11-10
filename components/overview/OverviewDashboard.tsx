import Link from "next/link";
import { timeSeries, pctDelta, METRICS, type AnalyticsCall, type Bucket, type Summary } from "@/lib/metrics/aggregate";
import { OUTCOME_COLOR, OUTCOME_ORDER } from "@/lib/colors";
import { OUTCOME_LABEL, ROOT_CAUSE_LABEL, type Outcome, type RootCause } from "@/lib/types";
import Chart from "@/components/charts/Chart";
import { Card, Kpi, KpiGrid, Insight, fmtPct, fmtMoney } from "@/components/ui";

/**
 * "AI call analysis" part of the Overview: business outcomes, root causes and conversation
 * quality. Shared by real workspaces and the demo. Retell's own metrics live in RetellAnalytics.
 */
export default function OverviewDashboard({ s, p, calls, range, timezone, agentName, bucket, callsHref, insightsHref }: {
  s: Summary; p: Summary | null; calls: AnalyticsCall[]; range: { from: string; to: string }; timezone: string;
  agentName: string | null; bucket: Bucket; callsHref: (extra: string) => string; insightsHref: string;
}) {
  const d = (a: number | null | undefined, b: number | null | undefined) => (p ? pctDelta(a ?? null, b ?? null) : null);
  const metric = (id: string) => METRICS.find((m) => m.id === id)!;
  const volume = timeSeries(calls, metric("call_count"), "count", bucket, range, timezone, "outcome");
  const success = timeSeries(calls, metric("success_rate"), "avg", bucket, range, timezone);
  const xLabels = volume.x.map((x) => x.slice(5));
  const outcomeKeys = OUTCOME_ORDER.filter((k) => s.by_outcome[k]);
  const rootCauses = Object.entries(s.by_root_cause).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const durByOutcome = OUTCOME_ORDER.filter((k) => s.duration_by_outcome[k] != null);
  const pending = s.by_outcome["unanalyzed"] ?? 0;
  const busiestDays = [...s.by_dow.map((v, i) => [v, i] as const)].sort((a, b) => b[0] - a[0]);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const peakHour = s.by_hour.indexOf(Math.max(...s.by_hour));

  return (
    <section aria-labelledby="ai-analysis" className="space-y-5">
      <div>
        <h2 id="ai-analysis" className="section-title">AI call analysis</h2>
        <p className="text-xs text-muted mt-1.5">Every call reviewed by Claude: what the caller needed, whether they got it, and why not.</p>
      </div>

      <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Executive Summary</span>
        </div>
        <p className="text-base font-normal text-slate-800 leading-relaxed">
          Your AI agent{agentName ? ` ${agentName}` : ""} handled <b className="font-semibold text-slate-900">{s.total.toLocaleString()} calls</b> and spent{" "}
          <b className="font-semibold text-slate-900">{s.total_talk_min.toFixed(1)} minutes</b> on the phone. Of {s.customer_calls} real customer calls,{" "}
          <b className="font-semibold text-slate-900">{s.good_outcomes} ended well ({fmtPct(s.success_rate)})</b>.
          {pending > 0 && <span className="font-normal text-slate-400"> ({pending} still being analyzed.)</span>}
        </p>
      </div>

      <KpiGrid>
        <Kpi label="Success rate (AI)" value={fmtPct(s.success_rate)} sub={`${s.good_outcomes} of ${s.customer_calls} customer calls`} delta={d(s.success_rate, p?.success_rate)} />
        <Kpi label="Booked" value={s.by_outcome.booked ?? 0} sub="appointments" href={callsHref("outcome=booked")} />
        <Kpi label="Connected to team" value={<>{s.transfer_ok}<span className="text-lg text-dim font-medium"> / {s.transfer_attempts}</span></>} sub={`${fmtPct(s.transfer_success_rate)} transfer success`} href={callsHref("outcome=transfer_ok,transfer_fail")} />
        <Kpi label="Leads captured" value={s.by_outcome.lead_captured ?? 0} sub="for follow-up" href={callsHref("outcome=lead_captured")} />
        <Kpi label="Silent hangups" value={s.silent_hangups} tone={s.silent_hangups > 0 ? "bad" : undefined} sub="caller never spoke" delta={d(s.silent_hangups, p?.silent_hangups)} deltaGoodWhen="down" href={callsHref("outcome=silent")} />
        <Kpi label="AI quality score" value={s.avg_score === null ? "—" : Math.round(s.avg_score)} unit={s.avg_score === null ? undefined : "/100"} delta={d(s.avg_score, p?.avg_score)} sub={`${fmtMoney(s.cost_per_good_outcome_cents)} per good outcome`} />
      </KpiGrid>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="What happened on each call" sub="AI outcome per call · tiles above open the matching calls">
          <Chart kind="donut" ariaLabel="Outcome breakdown" categories={outcomeKeys.map((k) => OUTCOME_LABEL[k as Outcome] ?? "Not analyzed yet")}
            series={[{ name: "Calls", data: outcomeKeys.map((k) => s.by_outcome[k]) }]} sliceColors={outcomeKeys.map((k) => OUTCOME_COLOR[k])} />
          <Insight>
            Of {s.customer_calls} real customer calls, <b>{s.good_outcomes} ended in a good result</b>: {s.by_outcome.booked ?? 0} bookings,{" "}
            {s.by_outcome.transfer_ok ?? 0} hand-offs to your team, {s.by_outcome.lead_captured ?? 0} saved leads and {s.by_outcome.info ?? 0} questions answered.
          </Insight>
        </Card>
        <Card title="Outcomes over time" sub={`Per ${bucket}, split by AI outcome`}>
          <Chart kind="stacked" labels="none" ariaLabel="Call volume over time by outcome" categories={xLabels}
            series={volume.series.map((sr) => ({ name: OUTCOME_LABEL[sr.name as Outcome] ?? "Not analyzed", data: sr.data, color: OUTCOME_COLOR[sr.name] }))} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Success rate trend (AI)" sub="Good outcomes ÷ real customer calls">
          <Chart kind="line" unit="%" ariaLabel="Success rate trend" categories={xLabels} series={[{ name: "Success rate", data: success.series[0]?.data ?? [], color: "--s3" }]} />
        </Card>
        <Card title="Top reasons calls went wrong" sub="Primary root cause from the AI diagnosis">
          {rootCauses.length ? (
            <Chart kind="bar" ariaLabel="Root causes" categories={rootCauses.map(([k]) => ROOT_CAUSE_LABEL[k as RootCause] ?? k)}
              series={[{ name: "Calls", data: rootCauses.map(([, v]) => v), color: "--s2" }]} height={Math.max(180, rootCauses.length * 34)} />
          ) : <p className="text-sm text-dim">No problems detected yet{pending ? " (analysis still running)" : ""}.</p>}
          <div className="mt-3"><Link href={insightsHref} className="text-xs font-medium underline">See fixes in Insights →</Link></div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="When calls come in · by day">
          <Chart kind="column" ariaLabel="Calls by day of week" categories={DOW} series={[{ name: "Calls", data: s.by_dow }]} />
          <Insight><b>{DOW[busiestDays[0][1]]}, {DOW[busiestDays[1][1]]} and {DOW[busiestDays[2][1]]}</b> bring in{" "}
            {fmtPct((busiestDays[0][0] + busiestDays[1][0] + busiestDays[2][0]) / Math.max(1, s.total))} of calls.</Insight>
        </Card>
        <Card title="When calls come in · by hour" sub={timezone}>
          <Chart kind="column" labels="none" ariaLabel="Calls by hour of day" categories={s.by_hour.map((_, h) => String(h).padStart(2, "0"))} series={[{ name: "Calls", data: s.by_hour }]} />
          <Insight>Busiest hour: <b>{peakHour}:00–{peakHour + 1}:00</b>. <b>{s.after_hours_calls}</b> calls ({fmtPct(s.after_hours_calls / Math.max(1, s.total))}) came in outside business hours — the agent covered those for you.</Insight>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="How long each type of call takes" sub="Average duration by AI outcome">
          <Chart kind="bar" unit="s" ariaLabel="Duration by outcome" categories={durByOutcome.map((k) => OUTCOME_LABEL[k as Outcome] ?? k)}
            series={[{ name: "Avg duration", data: durByOutcome.map((k) => s.duration_by_outcome[k]) }]} height={Math.max(180, durByOutcome.length * 34)} />
        </Card>
        <Card title="Conversation quality" sub="Measured from word timestamps and call audio">
          <div className="grid grid-cols-2 gap-px bg-line border border-line rounded-xl">
            <Mini label="Time to first word" value={s.conversation.avg_time_to_first_word_s == null ? "—" : `${s.conversation.avg_time_to_first_word_s.toFixed(1)}s`} />
            <Mini label="Agent response gap" value={s.conversation.avg_response_gap_s == null ? "—" : `${s.conversation.avg_response_gap_s.toFixed(1)}s`} />
            <Mini label="Interruptions per call" value={s.conversation.avg_interruptions == null ? "—" : s.conversation.avg_interruptions.toFixed(1)} />
            <Mini label="Dead air" value={fmtPct(s.conversation.avg_dead_air_pct)} />
            <Mini label="Overtalk" value={fmtPct(s.conversation.avg_overtalk_pct, 1)} />
            <Mini label="Calls with loops" value={String(s.conversation.calls_with_repetition)} />
            <Mini label="Tool calls (failed)" value={`${s.conversation.tool_calls} (${s.conversation.tool_failures})`} />
            <Mini label="Repeat callers (7 days)" value={String(s.repeat_callers)} />
          </div>
        </Card>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-3">
      <div className="eyebrow !text-xs">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
