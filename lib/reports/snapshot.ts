// Pure report-snapshot builder: no database, no AI. Used by the real report generator
// (after loading calls from Supabase) and by the demo, so both produce identical reports.

import { summarize, type AnalyticsCall, type Summary } from "../metrics/aggregate";
import { topIssues } from "../insights";
import type { CallDiagnosis, ReportNarrative } from "../ai/schemas";
import { OUTCOME_LABEL, ROOT_CAUSE_LABEL, type Outcome, type RootCause } from "../types";

export interface ReportCall {
  n: number;
  call_id: string;
  time: string | null;
  caller: string;
  phone: string | null;
  reason: string;
  outcome: string | null;
  dur_s: number | null;
  sentiment: string | null;
  summary: string;
  what_failed: string[];
  what_worked: string[];
  root_cause: string | null;
  score: number | null;
  transcript: string;
}

export interface ReportSnapshot {
  version: 1;
  workspace: { name: string; logo_url: string | null; brand_primary: string; agent_name: string | null; timezone: string };
  period: { from: string; to: string };
  summary: Summary;
  previous: Summary | null;
  issues: { cause: string; count: number; fix: string; examples: number[] }[];
  calls: ReportCall[];
  generated_at: string;
}

type CallWithAnalysis = AnalyticsCall & { analysis?: Record<string, unknown> | null; call_summary?: string | null };

export function snapshotFromCalls(args: {
  calls: CallWithAnalysis[];
  prev: CallWithAnalysis[];
  transcripts: Map<string, string>;
  workspace: ReportSnapshot["workspace"];
  businessHours?: Record<string, [number, number]>;
  period: { from: string; to: string };
}): ReportSnapshot {
  const ctx = { timezone: args.workspace.timezone, businessHours: args.businessHours };
  const calls = [...args.calls].sort((a, b) => (a.start_ts ?? "").localeCompare(b.start_ts ?? ""));
  const numberOf = new Map(calls.map((c, i) => [c.call_id, i + 1]));
  const reportCalls: ReportCall[] = calls.map((c, i) => {
    const d = c.analysis as unknown as CallDiagnosis | null;
    return {
      n: i + 1,
      call_id: c.call_id,
      time: c.start_ts,
      caller: d?.captured?.caller_name || "Unknown caller",
      phone: d?.captured?.callback_number || c.from_number,
      reason: d?.caller_intent ?? (c.call_summary ?? "").slice(0, 80),
      outcome: c.outcome ?? null,
      dur_s: c.duration_ms == null ? null : Math.round(c.duration_ms / 1000),
      sentiment: c.user_sentiment,
      summary: d?.plain_english_summary ?? c.call_summary ?? "",
      what_failed: (d?.what_failed ?? []).map((w) => w.point),
      what_worked: (d?.what_worked ?? []).map((w) => w.point),
      root_cause: c.primary_root_cause ?? null,
      score: c.overall_score ?? null,
      transcript: args.transcripts.get(c.call_id) ?? "",
    };
  });
  const issues = topIssues(calls, args.prev).slice(0, 6).map((it) => ({
    cause: it.cause, count: it.count, fix: it.fixes[0]?.text ?? "",
    examples: it.examples.map((e) => numberOf.get(e.call_id)!).filter(Boolean),
  }));
  return {
    version: 1,
    workspace: args.workspace,
    period: args.period,
    summary: summarize(calls, ctx),
    previous: args.prev.length ? summarize(args.prev, ctx) : null,
    issues,
    calls: reportCalls,
    generated_at: new Date().toISOString(),
  };
}

const pct = (x: number | null | undefined, d = 0) => (x == null ? "n/a" : `${(x * 100).toFixed(d)}%`);
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Deterministic plain-English summary built only from the snapshot. Used when the AI summary
 * is switched off (or unavailable) so every report still explains itself.
 */
export function ruleNarrative(s: ReportSnapshot): ReportNarrative {
  const m = s.summary;
  const days = Math.max(1, Math.round((Date.parse(s.period.to) - Date.parse(s.period.from)) / 86400_000));
  const span = days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} days`;
  const booked = m.by_outcome.booked ?? 0, leads = m.by_outcome.lead_captured ?? 0, info = m.by_outcome.info ?? 0;
  const failedTransfers = m.transfer_attempts - m.transfer_ok;
  const topDays = m.by_dow.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 3);
  const peakHour = m.by_hour.indexOf(Math.max(...m.by_hour));
  const failedCalls = s.calls.filter((c) => c.outcome === "transfer_fail");
  const emergencies = s.calls.filter((c) => /emergenc|sinking|stuck|stranded|dead on/i.test(c.reason) && c.outcome === "transfer_ok").length;

  const worked: string[] = [];
  if (booked) worked.push(`Booked ${booked} appointment${booked === 1 ? "" : "s"} directly into your calendar.`);
  if (m.transfer_attempts) worked.push(`Connected ${m.transfer_ok} of ${m.transfer_attempts} callers to your team (${pct(m.transfer_success_rate, 1)} transfer success).`);
  if (leads) worked.push(`Captured contact details from ${leads} caller${leads === 1 ? "" : "s"} for follow-up.`);
  if (info) worked.push(`Answered ${info} caller question${info === 1 ? "" : "s"} without needing your team.`);
  if (emergencies) worked.push(`Handled ${emergencies} emergency call${emergencies === 1 ? "" : "s"} by passing them straight to your team.`);
  if (m.after_hours_calls) worked.push(`Covered ${m.after_hours_calls} call${m.after_hours_calls === 1 ? "" : "s"} outside business hours.`);

  const fix: string[] = [];
  if (m.silent_hangups) fix.push(`${m.silent_hangups} caller${m.silent_hangups === 1 ? "" : "s"} hung up without saying anything. Check that the greeting starts quickly and sounds natural.`);
  for (const c of failedCalls.slice(0, 2)) fix.push(`Hand-off on call #${c.n} failed: ${(c.what_failed[0] ?? c.summary).replace(/\.$/, "")}.`);
  for (const it of s.issues.filter((i) => i.cause !== "caller_dropped").slice(0, 2)) {
    fix.push(`${ROOT_CAUSE_LABEL[it.cause as RootCause] ?? it.cause} on ${it.count} call${it.count === 1 ? "" : "s"}${it.examples.length ? ` (e.g. call #${it.examples[0]})` : ""}.`);
  }
  if ((m.e2e_p90_latency_ms.p90 ?? 0) > 2000) fix.push(`The slowest responses take over 2 seconds; callers notice pauses that long.`);
  if (!fix.length) fix.push("No recurring problems found in this period.");

  const actions = s.issues.filter((i) => i.fix).slice(0, 4).map((i) => ({
    action: i.fix,
    why: `${ROOT_CAUSE_LABEL[i.cause as RootCause] ?? i.cause} affected ${i.count} call${i.count === 1 ? "" : "s"}${i.examples.length ? ` (${i.examples.slice(0, 3).map((n) => `#${n}`).join(", ")})` : ""}.`,
    expected_impact: "Fewer failed calls of this type next period.",
  }));

  const outcomeList = Object.entries(m.by_outcome).filter(([k]) => k !== "unanalyzed").sort((a, b) => b[1] - a[1])
    .slice(0, 3).map(([k, v]) => `${v} ${(OUTCOME_LABEL[k as Outcome] ?? k).toLowerCase()}`).join(", ");

  return {
    headline: `In ${span}, your AI receptionist answered ${m.total} calls and spent ${m.total_talk_min.toFixed(1)} minutes on the phone.`,
    what_worked: worked.length ? worked.slice(0, 5) : ["The agent answered every call that came in."],
    what_needs_fixing: fix.slice(0, 5),
    recommended_actions: actions,
    bottom_line: `Of the ${m.customer_calls} real customer calls (excluding spam and empty calls), ${m.good_outcomes} ended in a good result for your business.`,
    chart_insights: {
      outcomes: `Of ${m.customer_calls} real customer calls, ${m.good_outcomes} ended well. Most common outcomes: ${outcomeList || "none yet"}.`,
      transfers: m.transfer_attempts ? `${m.transfer_ok} of ${m.transfer_attempts} hand-offs connected${failedTransfers ? `; ${failedTransfers} did not` : ""}.` : "The agent didn't need to transfer any calls.",
      sentiment: `${m.by_sentiment.Positive ?? 0} callers ended the call in a positive mood and ${m.by_sentiment.Negative ?? 0} in a negative mood.`,
      disconnections: "Most calls end with the caller hanging up once they have what they need.",
      by_day: topDays[0]?.[0] ? `${DOW[topDays[0][1]]}, ${DOW[topDays[1][1]]} and ${DOW[topDays[2][1]]} are your busiest days.` : "No calls in this period.",
      by_hour: `Your busiest hour is ${peakHour}:00 to ${peakHour + 1}:00. ${m.after_hours_calls} calls came in outside business hours.`,
      duration: `The average call lasts ${Math.round(m.duration_s.avg ?? 0)} seconds.`,
      conversation_quality: `The median response time is ${m.e2e_latency_ms.median == null ? "n/a" : `${Math.round(m.e2e_latency_ms.median)} ms`}; ${m.conversation.calls_with_repetition} calls had the agent repeat itself.`,
    },
  };
}
