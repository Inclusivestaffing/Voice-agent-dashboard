import type { RetellCall } from "../types";
import { demoTranscript, type DemoCall } from "./openWater";

/** A Retell-shaped call object for a demo call (transcript, latency, cost breakdown, analysis). */
export function demoRawCall(c: DemoCall): RetellCall {
  const transcript = demoTranscript(c.call_id);
  const turns = transcript.filter((u) => u.role === "agent").length;
  const base = c.e2e_p50_ms ?? 900;
  return {
    call_id: c.call_id, call_type: "phone_call", agent_id: "agent_allen_demo", agent_name: "Allen", agent_version: c.agent_version ?? undefined,
    call_status: (c.call_status ?? "ended") as RetellCall["call_status"], direction: "inbound", from_number: c.from_number ?? undefined, to_number: c.to_number ?? undefined,
    duration_ms: c.duration_ms ?? undefined, transcript_object: transcript, disconnection_reason: c.disconnection_reason ?? undefined,
    metadata: c.metadata ?? undefined, retell_llm_dynamic_variables: { business: "Open Water Marine" },
    latency: c.duration_ms == null ? undefined : {
      e2e: { p50: base, p90: c.e2e_p90_ms ?? base * 1.5, max: (c.e2e_p90_ms ?? base) * 1.2, min: base * 0.7, values: Array.from({ length: Math.max(2, turns) }, (_, i) => Math.round(base * (0.75 + ((i * 37) % 60) / 100))) },
      llm: { p50: Math.round(base * 0.45), p90: Math.round(base * 0.7) }, tts: { p50: Math.round(base * 0.22), p90: Math.round(base * 0.3) }, asr: { p50: Math.round(base * 0.18), p90: Math.round(base * 0.25) },
    },
    call_cost: c.combined_cost_cents == null ? undefined : { combined_cost: c.combined_cost_cents, product_costs: [
      { product: "elevenlabs_tts", unit_price: 0, cost: Math.round(c.combined_cost_cents * 0.55 * 100) / 100 },
      { product: "gpt_4o_mini", unit_price: 0, cost: Math.round(c.combined_cost_cents * 0.15 * 100) / 100 },
      { product: "retell_platform", unit_price: 0, cost: Math.round(c.combined_cost_cents * 0.3 * 100) / 100 },
    ] },
    call_analysis: { call_summary: c.call_summary ?? undefined, user_sentiment: (c.user_sentiment ?? "Unknown") as "Neutral", call_successful: c.call_successful ?? undefined, custom_analysis_data: c.custom_analysis ?? undefined },
  };
}
