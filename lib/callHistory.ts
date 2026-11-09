import type { AnalyticsCall } from "./metrics/aggregate";
import type { CallHistoryRow } from "@/components/calls/CallHistoryTable";

/** Shape a call into the serializable row the Call History table renders. */
export function toHistoryRow(c: AnalyticsCall & { analysis?: Record<string, unknown> | null }): CallHistoryRow {
  return {
    call_id: c.call_id, start_ts: c.start_ts, duration_ms: c.duration_ms, call_type: c.call_type, direction: c.direction,
    combined_cost_cents: c.combined_cost_cents, disconnection_reason: c.disconnection_reason, call_status: c.call_status,
    user_sentiment: c.user_sentiment, from_number: c.from_number, to_number: c.to_number ?? null, call_successful: c.call_successful,
    e2e_p50_ms: c.e2e_p50_ms, agent_name: c.agent_name, agent_version: c.agent_version, batch_call_id: c.batch_call_id ?? null,
    outcome: c.outcome ?? null, primary_root_cause: c.primary_root_cause ?? null, overall_score: c.overall_score ?? null,
    intent: (c.analysis as { caller_intent?: string } | null | undefined)?.caller_intent ?? null,
  };
}
