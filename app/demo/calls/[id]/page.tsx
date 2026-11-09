import { notFound } from "next/navigation";
import { filtersToQuery } from "@/lib/filters";
import { computeTiming } from "@/lib/metrics/timing";
import { demoCalls, demoTranscript, filterDemo, DEMO_TZ } from "@/lib/demo/openWater";
import { demoFilters } from "@/lib/demo/params";
import type { RetellCall } from "@/lib/types";
import CallDetailView from "@/components/call-detail/CallDetailView";

export const dynamic = "force-dynamic";

export default async function DemoCallDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const all = demoCalls();
  const c = all.find((x) => x.call_id === id);
  if (!c) notFound();
  const { f } = demoFilters(sp, `/demo/calls/${encodeURIComponent(id)}`);
  const list = filterDemo(all, f).sort((a, b) => (b.start_ts ?? "").localeCompare(a.start_ts ?? ""));
  const idx = list.findIndex((x) => x.call_id === id);
  const q = filtersToQuery(f);
  const link = (cid: string) => `/demo/calls/${cid}?${q}`;

  const transcript = demoTranscript(id);
  const turns = transcript.filter((u) => u.role === "agent").length;
  const base = c.e2e_p50_ms ?? 900;
  const raw: RetellCall = {
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
  const timing = computeTiming(raw).metrics;

  return (
    <CallDetailView
      call={{ ...c, to_number: c.to_number ?? null, transfer_destination: c.transfer_destination ?? null, custom_analysis: c.custom_analysis ?? null, recording_url: null, recording_multi_channel_url: null, public_log_url: null }}
      raw={raw}
      metrics={c.duration_ms == null ? null : { ...timing, audio_analyzed: false, audio_error: "Demo data has no recording." }}
      analysis={c.analysis ? { outcome: c.outcome, analysis: c.analysis, source: c.overall_score == null ? "rules" : "llm", overall_score: c.overall_score, model: "claude-sonnet-5-5" } : null}
      timezone={DEMO_TZ} agentName="Allen" workspaceId="demo" canEdit={false}
      nav={{ back: `/demo/calls?${q}`, prev: idx > 0 ? link(list[idx - 1].call_id) : null, next: idx >= 0 && idx < list.length - 1 ? link(list[idx + 1].call_id) : null }} />
  );
}
