import "server-only";
import { supabaseAdmin } from "./db/supabase";
import { summarize, type AnalyticsCall } from "./metrics/aggregate";
import { assertPublicHttpsUrl } from "./security";

export const ALERT_METRICS: { id: string; label: string; unit: string; compute: (s: ReturnType<typeof summarize>) => number | null }[] = [
  { id: "success_rate", label: "Success rate", unit: "%", compute: (s) => (s.success_rate == null ? null : s.success_rate * 100) },
  { id: "transfer_fail_count", label: "Failed transfers", unit: "calls", compute: (s) => s.transfer_attempts - s.transfer_ok },
  { id: "negative_sentiment_rate", label: "Negative sentiment rate", unit: "%", compute: (s) => (s.total ? ((s.by_sentiment.Negative ?? 0) / s.total) * 100 : null) },
  { id: "e2e_p90", label: "Latency p90", unit: "ms", compute: (s) => s.e2e_p90_latency_ms.p90 },
  { id: "cost_sum", label: "Total cost", unit: "$", compute: (s) => s.cost_cents.sum / 100 },
  { id: "silent_hangup_rate", label: "Silent hangup rate", unit: "%", compute: (s) => (s.total ? (s.silent_hangups / s.total) * 100 : null) },
  { id: "error_count", label: "Calls ending in errors", unit: "calls", compute: (s) => Object.entries(s.by_disconnection).filter(([k]) => k.startsWith("error")).reduce((a, [, v]) => a + v, 0) },
];

/** Evaluate every enabled alert rule; fires a webhook (Slack-compatible JSON) when breached. */
export async function evaluateAlerts() {
  const db = supabaseAdmin();
  const { data: rules } = await db.from("alert_rules").select("*, workspaces(name, slug, timezone)").eq("enabled", true);
  const fired: string[] = [];
  for (const r of rules ?? []) {
    if (r.last_fired_at && Date.now() - Date.parse(r.last_fired_at) < r.window_minutes * 60_000) continue; // one alert per window
    const from = new Date(Date.now() - r.window_minutes * 60_000).toISOString();
    const { data: calls } = await db.from("calls")
      .select("call_id, start_ts, end_ts, duration_ms, agent_id, agent_name, agent_version, call_type, direction, call_status, disconnection_reason, user_sentiment, call_successful, in_voicemail, combined_cost_cents, e2e_p50_ms, e2e_p90_ms, from_number, call_analyses(outcome)")
      .eq("workspace_id", r.workspace_id).gte("start_ts", from).limit(5000);
    const rows = (calls ?? []).map((c) => ({ ...c, outcome: (Array.isArray(c.call_analyses) ? c.call_analyses[0] : c.call_analyses)?.outcome ?? null })) as unknown as AnalyticsCall[];
    if (!rows.length) continue;
    const ws = (Array.isArray(r.workspaces) ? r.workspaces[0] : r.workspaces) as { name: string; slug: string; timezone: string };
    const s = summarize(rows, { timezone: ws.timezone });
    const def = ALERT_METRICS.find((m) => m.id === r.metric);
    const value = def?.compute(s);
    if (value == null) continue;
    const breached = r.comparator === "lt" ? value < r.threshold : value > r.threshold;
    if (!breached) continue;
    const text = `⚠️ ${ws.name}: ${def!.label} is ${value.toFixed(1)}${def!.unit === "%" ? "%" : ` ${def!.unit}`} over the last ${r.window_minutes} min (rule: ${r.comparator === "lt" ? "below" : "above"} ${r.threshold}). ${s.total} calls in window. ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/w/${ws.slug}/overview`;
    if (r.webhook_url) {
      try {
        const url = await assertPublicHttpsUrl(r.webhook_url);
        await fetch(url, {
          method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, rule: r.name, metric: r.metric, value, threshold: r.threshold, workspace: ws.name }),
        });
      } catch (e) {
        console.warn("alert webhook skipped", r.id, e instanceof Error ? e.message : e);
      }
    }
    await db.from("alert_rules").update({ last_fired_at: new Date().toISOString() }).eq("id", r.id);
    fired.push(`${ws.name}: ${r.name}`);
  }
  return fired;
}
