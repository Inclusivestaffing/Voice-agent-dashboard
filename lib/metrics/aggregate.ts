// Aggregate analytics over a set of calls. Pure functions: the same code powers the
// dashboard, the custom-chart builder and the report snapshot, so the numbers in a
// report always match what the dashboard shows.

import { GOOD_OUTCOMES, NON_CUSTOMER_OUTCOMES, type Outcome } from "../types";
import { distribution, rate, type Distribution } from "./stats";
import { maxConcurrency } from "./concurrency";

export interface AnalyticsCall {
  call_id: string;
  start_ts: string | null;
  end_ts: string | null;
  duration_ms: number | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_version: number | null;
  call_type: string | null;
  direction: string | null;
  call_status: string | null;
  disconnection_reason: string | null;
  user_sentiment: string | null;
  call_successful: boolean | null;
  in_voicemail: boolean | null;
  combined_cost_cents: number | null;
  e2e_p50_ms: number | null;
  e2e_p90_ms: number | null;
  from_number: string | null;
  to_number?: string | null;
  batch_call_id?: string | null;
  transfer_destination?: string | null;
  custom_analysis?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  dynamic_variables?: Record<string, unknown> | null;
  // joined
  outcome?: Outcome | null;
  primary_root_cause?: string | null;
  root_causes?: string[] | null;
  overall_score?: number | null;
  severity?: string | null;
  m?: Partial<{
    interruptions: number; agent_interruptions: number; dead_air_pct: number; overtalk_pct: number;
    time_to_first_word_s: number; avg_response_gap_s: number; longest_silence_s: number;
    talk_ratio: number; repetition_count: number; tool_calls: number; tool_failures: number;
    longest_agent_monologue_s: number;
  }> | null;
}

export interface WorkspaceTimeCtx {
  timezone: string;
  businessHours?: Record<string, [number, number]>;
}

const TRANSFER_REASONS = new Set(["call_transfer", "transfer_bridged", "transfer_cancelled"]);
const NOT_PICKED_UP = new Set(["dial_busy", "dial_failed", "dial_no_answer", "invalid_destination", "voicemail_reached", "user_declined", "ivr_reached"]);
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function isTransfer(c: AnalyticsCall): boolean {
  return TRANSFER_REASONS.has(c.disconnection_reason ?? "") || c.outcome === "transfer_ok" || c.outcome === "transfer_fail";
}
export function isTransferOk(c: AnalyticsCall): boolean {
  if (c.outcome) return c.outcome === "transfer_ok";
  return c.disconnection_reason === "call_transfer" || c.disconnection_reason === "transfer_bridged";
}
export function isPickedUp(c: AnalyticsCall): boolean {
  return c.call_status === "ended" && !c.in_voicemail && !NOT_PICKED_UP.has(c.disconnection_reason ?? "");
}
export function isCustomerCall(c: AnalyticsCall): boolean {
  return c.outcome ? !NON_CUSTOMER_OUTCOMES.includes(c.outcome) : c.call_status === "ended";
}
export function isGood(c: AnalyticsCall): boolean {
  return c.outcome ? GOOD_OUTCOMES.includes(c.outcome) : c.call_successful === true;
}

/** Local wall-clock parts of a timestamp in the workspace timezone. */
export function localParts(iso: string, timezone: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24,
    dow: DOW.indexOf(String(p.weekday).toLowerCase().slice(0, 3)),
    date: `${p.year}-${p.month}-${p.day}`,
  };
}

export function isAfterHours(iso: string, ctx: WorkspaceTimeCtx): boolean {
  if (!ctx.businessHours) return false;
  const lp = localParts(iso, ctx.timezone);
  const d = new Date(iso);
  const minutes = new Intl.DateTimeFormat("en-US", { timeZone: ctx.timezone, minute: "2-digit" }).format(d);
  const h = lp.hour + Number(minutes) / 60;
  const window = ctx.businessHours[DOW[lp.dow]];
  return !window || h < window[0] || h >= window[1];
}

function countBy<T>(xs: T[], key: (x: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) {
    const k = key(x) ?? "unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export interface Summary {
  total: number;
  ended: number;
  customer_calls: number;
  good_outcomes: number;
  success_rate: number | null;           // good outcomes / customer calls (business view)
  retell_success_rate: number | null;    // Retell's call_successful / calls with a value
  picked_up_rate: number | null;
  transfer_rate: number | null;
  transfer_attempts: number;
  transfer_ok: number;
  transfer_success_rate: number | null;
  voicemail_rate: number | null;
  silent_hangups: number;
  unique_callers: number;
  repeat_callers: number;                // same number calling again within 7 days
  after_hours_calls: number;
  duration_s: Distribution;
  total_talk_min: number;
  e2e_latency_ms: Distribution;          // distribution of per-call p50
  e2e_p90_latency_ms: Distribution;
  cost_cents: Distribution;
  cost_per_good_outcome_cents: number | null;
  max_concurrency: number;
  max_concurrency_at: string | null;
  avg_score: number | null;
  conversation: {
    avg_interruptions: number | null;
    avg_dead_air_pct: number | null;
    avg_overtalk_pct: number | null;
    avg_time_to_first_word_s: number | null;
    avg_response_gap_s: number | null;
    calls_with_repetition: number;
    tool_calls: number;
    tool_failures: number;
  };
  by_outcome: Record<string, number>;
  by_sentiment: Record<string, number>;
  by_disconnection: Record<string, number>;
  by_status: Record<string, number>;
  by_direction: Record<string, number>;
  by_call_type: Record<string, number>;
  by_root_cause: Record<string, number>;
  by_agent: Record<string, number>;
  by_dow: number[];      // Sun..Sat
  by_hour: number[];     // 0..23
  duration_by_outcome: Record<string, number | null>;
}

export function summarize(calls: AnalyticsCall[], ctx: WorkspaceTimeCtx): Summary {
  const customer = calls.filter(isCustomerCall);
  const good = customer.filter(isGood);
  const transfers = calls.filter(isTransfer);
  const transferOk = transfers.filter(isTransferOk);
  const withRetellSuccess = calls.filter((c) => c.call_successful !== null && c.call_successful !== undefined);
  const durations = calls.map((c) => (c.duration_ms ?? null) === null ? null : c.duration_ms! / 1000);
  const costs = calls.map((c) => c.combined_cost_cents);
  const conc = maxConcurrency(calls);

  // Repeat callers: a number that calls again within 7 days of a previous call.
  const byNumber = new Map<string, number[]>();
  for (const c of calls) {
    if (!c.from_number || !c.start_ts) continue;
    const arr = byNumber.get(c.from_number) ?? [];
    arr.push(Date.parse(c.start_ts));
    byNumber.set(c.from_number, arr);
  }
  let repeat = 0;
  for (const ts of byNumber.values()) {
    ts.sort((a, b) => a - b);
    if (ts.some((t, i) => i > 0 && t - ts[i - 1] <= 7 * 86400_000)) repeat++;
  }

  const byDow = new Array(7).fill(0);
  const byHour = new Array(24).fill(0);
  let afterHours = 0;
  for (const c of calls) {
    if (!c.start_ts) continue;
    const lp = localParts(c.start_ts, ctx.timezone);
    byDow[lp.dow]++;
    byHour[lp.hour]++;
    if (isAfterHours(c.start_ts, ctx)) afterHours++;
  }

  const durByOutcome: Record<string, number[]> = {};
  for (const c of calls) {
    if (!c.outcome || c.duration_ms == null) continue;
    (durByOutcome[c.outcome] ??= []).push(c.duration_ms / 1000);
  }

  const ms = calls.map((c) => c.m).filter(Boolean) as NonNullable<AnalyticsCall["m"]>[];
  const avgOf = (k: keyof NonNullable<AnalyticsCall["m"]>) => distribution(ms.map((m) => m[k] as number | undefined)).avg;
  const scored = calls.map((c) => c.overall_score);
  const totalCost = distribution(costs).sum;

  return {
    total: calls.length,
    ended: calls.filter((c) => c.call_status === "ended").length,
    customer_calls: customer.length,
    good_outcomes: good.length,
    success_rate: rate(good.length, customer.length),
    retell_success_rate: rate(withRetellSuccess.filter((c) => c.call_successful).length, withRetellSuccess.length),
    picked_up_rate: rate(calls.filter(isPickedUp).length, calls.length),
    transfer_rate: rate(transfers.length, calls.length),
    transfer_attempts: transfers.length,
    transfer_ok: transferOk.length,
    transfer_success_rate: rate(transferOk.length, transfers.length),
    voicemail_rate: rate(calls.filter((c) => c.in_voicemail || c.disconnection_reason === "voicemail_reached").length, calls.length),
    silent_hangups: calls.filter((c) => c.outcome === "silent").length,
    unique_callers: byNumber.size,
    repeat_callers: repeat,
    after_hours_calls: afterHours,
    duration_s: distribution(durations),
    total_talk_min: distribution(durations).sum / 60,
    e2e_latency_ms: distribution(calls.map((c) => c.e2e_p50_ms)),
    e2e_p90_latency_ms: distribution(calls.map((c) => c.e2e_p90_ms)),
    cost_cents: distribution(costs),
    cost_per_good_outcome_cents: good.length ? totalCost / good.length : null,
    max_concurrency: conc.max,
    max_concurrency_at: conc.at,
    avg_score: distribution(scored).avg,
    conversation: {
      avg_interruptions: avgOf("interruptions"),
      avg_dead_air_pct: avgOf("dead_air_pct"),
      avg_overtalk_pct: avgOf("overtalk_pct"),
      avg_time_to_first_word_s: avgOf("time_to_first_word_s"),
      avg_response_gap_s: avgOf("avg_response_gap_s"),
      calls_with_repetition: ms.filter((m) => (m.repetition_count ?? 0) > 0).length,
      tool_calls: ms.reduce((a, m) => a + (m.tool_calls ?? 0), 0),
      tool_failures: ms.reduce((a, m) => a + (m.tool_failures ?? 0), 0),
    },
    by_outcome: countBy(calls, (c) => c.outcome ?? "unanalyzed"),
    by_sentiment: countBy(calls, (c) => c.user_sentiment ?? "Unknown"),
    by_disconnection: countBy(calls, (c) => c.disconnection_reason),
    by_status: countBy(calls, (c) => c.call_status),
    by_direction: countBy(calls, (c) => c.direction ?? (c.call_type === "web_call" ? "web" : "unknown")),
    by_call_type: countBy(calls, (c) => c.call_type),
    by_root_cause: countBy(calls.filter((c) => c.primary_root_cause && c.primary_root_cause !== "none"), (c) => c.primary_root_cause),
    by_agent: countBy(calls, (c) => c.agent_name ?? c.agent_id),
    by_dow: byDow,
    by_hour: byHour,
    duration_by_outcome: Object.fromEntries(Object.entries(durByOutcome).map(([k, v]) => [k, distribution(v).avg])),
  };
}

// ───────────── Custom chart builder: metric registry, buckets, breakdowns ─────────────

export type Measure = "count" | "avg" | "median" | "p90" | "sum" | "min" | "max";

export interface MetricDef {
  id: string;
  label: string;
  measures: Measure[];
  unit?: "%" | "s" | "ms" | "$" | "";
  /** For count-type metrics: predicate. For value metrics: extractor. */
  value?: (c: AnalyticsCall) => number | null;
  rate?: (c: AnalyticsCall) => boolean | null;   // returns null to exclude from denominator
  /** Whole-set aggregate (e.g. concurrency) that can't be expressed per call. */
  aggregate?: (calls: AnalyticsCall[]) => number | null;
  /** True for Retell's own metrics (shown under "Retell analytics"); false for our AI/conversation extras. */
  retell?: boolean;
}

export const METRICS: MetricDef[] = [
  // ── Retell's call metrics (same names as Retell's analytics dashboard) ──
  { id: "call_count", label: "Call Counts", measures: ["count"], value: () => 1, retell: true },
  { id: "retell_success_rate", label: "Call Successful Rate", measures: ["avg"], unit: "%", rate: (c) => c.call_successful ?? null, retell: true },
  { id: "picked_up_rate", label: "Call Picked Up Rate", measures: ["avg"], unit: "%", rate: (c) => isPickedUp(c), retell: true },
  { id: "transfer_rate", label: "Call Transfer Rate", measures: ["avg"], unit: "%", rate: (c) => isTransfer(c), retell: true },
  { id: "voicemail_rate", label: "Voicemail Rate", measures: ["avg"], unit: "%", rate: (c) => !!c.in_voicemail || c.disconnection_reason === "voicemail_reached", retell: true },
  { id: "duration", label: "Call Duration", measures: ["avg", "median", "p90", "sum", "min", "max"], unit: "s", value: (c) => (c.duration_ms == null ? null : c.duration_ms / 1000), retell: true },
  { id: "e2e_latency", label: "End to End Latency", measures: ["avg", "median", "p90", "min", "max"], unit: "ms", value: (c) => c.e2e_p50_ms, retell: true },
  { id: "concurrency", label: "Concurrency Used", measures: ["max"], aggregate: (cs) => maxConcurrency(cs).max, retell: true },
  { id: "cost", label: "Combined cost", measures: ["avg", "sum", "median", "p90", "min", "max"], unit: "$", value: (c) => (c.combined_cost_cents == null ? null : c.combined_cost_cents / 100), retell: true },
  // ── Extras: AI diagnosis + conversation timing ──
  { id: "success_rate", label: "Success Rate (AI outcome)", measures: ["avg"], unit: "%", rate: (c) => (isCustomerCall(c) ? isGood(c) : null) },
  { id: "transfer_success_rate", label: "Transfer Success Rate", measures: ["avg"], unit: "%", rate: (c) => (isTransfer(c) ? isTransferOk(c) : null) },
  { id: "negative_sentiment_rate", label: "Negative Sentiment Rate", measures: ["avg"], unit: "%", rate: (c) => c.user_sentiment === "Negative" },
  { id: "e2e_latency_p90", label: "End to End Latency (per-call p90)", measures: ["avg", "median", "p90", "max"], unit: "ms", value: (c) => c.e2e_p90_ms },
  { id: "score", label: "AI Quality Score", measures: ["avg", "median", "min"], value: (c) => c.overall_score ?? null },
  { id: "interruptions", label: "Caller Interruptions", measures: ["avg", "sum", "max"], value: (c) => c.m?.interruptions ?? null },
  { id: "dead_air", label: "Dead Air %", measures: ["avg", "p90", "max"], unit: "%", value: (c) => (c.m?.dead_air_pct == null ? null : c.m.dead_air_pct * 100) },
  { id: "ttfw", label: "Time to First Word", measures: ["avg", "median", "p90", "max"], unit: "s", value: (c) => c.m?.time_to_first_word_s ?? null },
  { id: "response_gap", label: "Agent Response Gap", measures: ["avg", "p90", "max"], unit: "s", value: (c) => c.m?.avg_response_gap_s ?? null },
];

export type Dimension = "agent" | "agent_version" | "disconnection_reason" | "call_status" | "call_successful"
  | "call_type" | "direction" | "user_sentiment" | "outcome" | "root_cause" | `custom:${string}`;

export const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "agent_version", label: "Agent Version" },
  { id: "outcome", label: "Outcome (AI)" },
  { id: "root_cause", label: "Root cause (AI)" },
  { id: "disconnection_reason", label: "Disconnection Reason" },
  { id: "call_status", label: "Call Status" },
  { id: "call_successful", label: "Call Successful" },
  { id: "call_type", label: "Call Type" },
  { id: "direction", label: "Direction" },
  { id: "user_sentiment", label: "User Sentiment" },
];

export function dimensionValue(c: AnalyticsCall, dim: Dimension): string {
  switch (dim) {
    case "agent": return c.agent_name ?? c.agent_id ?? "unknown";
    case "agent_version": return `${c.agent_name ?? c.agent_id ?? "agent"} v${c.agent_version ?? "?"}`;
    case "call_successful": return c.call_successful == null ? "unknown" : c.call_successful ? "Successful" : "Unsuccessful";
    case "outcome": return c.outcome ?? "unanalyzed";
    case "root_cause": return c.primary_root_cause ?? "none";
    case "disconnection_reason": return c.disconnection_reason ?? "unknown";
    case "call_status": return c.call_status ?? "unknown";
    case "call_type": return c.call_type ?? "unknown";
    case "direction": return c.direction ?? "unknown";
    case "user_sentiment": return c.user_sentiment ?? "Unknown";
    default: {
      const key = dim.slice("custom:".length);
      const v = c.custom_analysis?.[key];
      return v === undefined || v === null ? "—" : String(v);
    }
  }
}

export function computeMetric(calls: AnalyticsCall[], def: MetricDef, measure: Measure): number | null {
  if (def.aggregate) return calls.length ? def.aggregate(calls) : null;
  if (def.rate) {
    const vals = calls.map(def.rate).filter((v): v is boolean => v !== null);
    return vals.length ? (vals.filter(Boolean).length / vals.length) * 100 : null;
  }
  if (def.id === "call_count") return calls.length;
  const d = distribution(calls.map((c) => def.value!(c)));
  switch (measure) {
    case "count": return d.count;
    case "avg": return d.avg;
    case "median": return d.median;
    case "p90": return d.p90;
    case "sum": return d.sum;
    case "min": return d.min;
    case "max": return d.max;
  }
}

export type Bucket = "hour" | "day" | "week" | "month";

export function bucketKey(iso: string, bucket: Bucket, timezone: string): string {
  const lp = localParts(iso, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (bucket) {
    case "hour": return `${lp.date} ${pad(lp.hour)}:00`;
    case "day": return lp.date;
    case "month": return `${lp.year}-${pad(lp.month)}`;
    case "week": {
      // ISO-ish week starting Monday, labelled by its Monday date.
      const d = new Date(Date.UTC(lp.year, lp.month - 1, lp.day));
      const offset = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - offset);
      return d.toISOString().slice(0, 10);
    }
  }
}

/** Fill every bucket between from and to so charts show zero days. */
export function bucketRange(fromIso: string, toIso: string, bucket: Bucket, timezone: string): string[] {
  const keys: string[] = [];
  const step = bucket === "hour" ? 3600_000 : 86400_000;
  const seen = new Set<string>();
  for (let t = Date.parse(fromIso); t <= Date.parse(toIso); t += step) {
    const k = bucketKey(new Date(t).toISOString(), bucket, timezone);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
    if (keys.length > 3000) break; // same cap as Retell's chart renderer
  }
  return keys;
}

export interface SeriesResult {
  x: string[];
  series: { name: string; data: (number | null)[] }[];
}

export function timeSeries(
  calls: AnalyticsCall[], def: MetricDef, measure: Measure, bucket: Bucket,
  range: { from: string; to: string }, timezone: string, breakdown?: Dimension,
): SeriesResult {
  const x = bucketRange(range.from, range.to, bucket, timezone);
  const groups = new Map<string, AnalyticsCall[]>();
  for (const c of calls) {
    const g = breakdown ? dimensionValue(c, breakdown) : def.label;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  const series = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([name, cs]) => {
      const byKey = new Map<string, AnalyticsCall[]>();
      for (const c of cs) {
        if (!c.start_ts) continue;
        const k = bucketKey(c.start_ts, bucket, timezone);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(c);
      }
      return {
        name,
        data: x.map((k) => {
          const subset = byKey.get(k) ?? [];
          if (!subset.length) return def.id === "call_count" || def.id === "concurrency" ? 0 : null;
          return computeMetric(subset, def, measure);
        }),
      };
    });
  return { x, series };
}

export function breakdownTotals(calls: AnalyticsCall[], def: MetricDef, measure: Measure, dim: Dimension) {
  const groups = new Map<string, AnalyticsCall[]>();
  for (const c of calls) {
    const g = dimensionValue(c, dim);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  return [...groups.entries()]
    .map(([name, cs]) => ({ name, value: computeMetric(cs, def, measure), calls: cs.length }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/** Previous period of equal length immediately before [from, to]. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = Date.parse(from), t = Date.parse(to);
  const len = t - f;
  return { from: new Date(f - len).toISOString(), to: new Date(f).toISOString() };
}

export function pctDelta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}
