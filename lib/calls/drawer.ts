import type { RetellCall } from "../types";
import type { CallDiagnosis } from "../ai/schemas";

/** Everything the Call History slide-over shows for one call (plain JSON, sent to the browser). */
export interface CallDrawerData {
  call_id: string;
  start_ts: string | null;
  end_ts: string | null;
  duration_ms: number | null;
  call_type: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  agent_name: string | null;
  agent_id: string | null;
  agent_version: number | null;
  call_status: string | null;
  disconnection_reason: string | null;
  transfer_destination: string | null;
  user_sentiment: string | null;
  call_successful: boolean | null;
  in_voicemail: boolean | null;
  combined_cost_cents: number | null;
  cost_breakdown: { product: string; cost_cents: number }[];
  summary: string | null;
  recording_url: string | null;
  public_log_url: string | null;
  transcript: { role: string; content: string; start: number | null; end: number | null }[];
  tool_events: { role: string; name: string | null; detail: string; ok: boolean | null }[];
  dynamic_variables: Record<string, string>;
  collected_variables: Record<string, string>;
  metadata: Record<string, unknown>;
  custom_analysis: Record<string, unknown>;
  latency: { name: string; p50: number | null; p90: number | null }[];
  analysis: CallDiagnosis | null;
  outcome: string | null;
  overall_score: number | null;
  analysis_source: string | null;
  contact_calls: { call_id: string; start_ts: string | null; direction: string | null; duration_ms: number | null }[];
  /** Demo calls have no recording; the panel reads the transcript aloud instead. */
  voice_preview: boolean;
}

const LATENCY_LABEL: Record<string, string> = {
  e2e: "End to end", llm: "LLM", tts: "Text to speech", asr: "Speech to text", knowledge_base: "Knowledge base", s2s: "Speech to speech", llm_websocket_network_rtt: "LLM network",
};

/** Shapes a Retell call (plus our stored columns and AI analysis) into the slide-over payload. */
export function toDrawerData(input: {
  row: {
    call_id: string; start_ts: string | null; end_ts?: string | null; duration_ms: number | null; call_type?: string | null; direction: string | null;
    from_number: string | null; to_number: string | null; agent_name: string | null; agent_id?: string | null; agent_version: number | null;
    call_status?: string | null; disconnection_reason: string | null; transfer_destination?: string | null; user_sentiment: string | null;
    call_successful: boolean | null; in_voicemail?: boolean | null; combined_cost_cents: number | null; call_summary?: string | null;
    custom_analysis?: Record<string, unknown> | null; recording_url?: string | null; public_log_url?: string | null;
  };
  raw: RetellCall | null;
  analysis: { analysis?: unknown; outcome?: string | null; overall_score?: number | null; source?: string | null } | null;
  contactCalls: CallDrawerData["contact_calls"];
  voicePreview?: boolean;
}): CallDrawerData {
  const { row, raw, analysis } = input;
  const d = (analysis?.analysis ?? null) as CallDiagnosis | null;
  const transcript = (raw?.transcript_object ?? []).filter((u) => u.content?.trim()).map((u) => ({
    role: u.role,
    content: u.content,
    start: u.words?.[0]?.start ?? null,
    end: u.words?.[u.words.length - 1]?.end ?? null,
  }));
  const tool_events = (raw?.transcript_with_tool_calls ?? [])
    .filter((e) => e.role === "tool_call_invocation" || e.role === "tool_call_result")
    .slice(0, 40)
    .map((e) => ({
      role: e.role,
      name: typeof e.name === "string" ? e.name : null,
      detail: String(e.role === "tool_call_invocation" ? e.arguments ?? "" : e.content ?? "").slice(0, 600),
      ok: typeof e.successful === "boolean" ? e.successful : null,
    }));
  const lat = raw?.latency ?? {};
  return {
    call_id: row.call_id,
    start_ts: row.start_ts,
    end_ts: row.end_ts ?? (row.start_ts && row.duration_ms != null ? new Date(Date.parse(row.start_ts) + row.duration_ms).toISOString() : null),
    duration_ms: row.duration_ms,
    call_type: row.call_type ?? raw?.call_type ?? null,
    direction: row.direction,
    from_number: row.from_number,
    to_number: row.to_number,
    agent_name: row.agent_name,
    agent_id: row.agent_id ?? raw?.agent_id ?? null,
    agent_version: row.agent_version,
    call_status: row.call_status ?? raw?.call_status ?? null,
    disconnection_reason: row.disconnection_reason,
    transfer_destination: row.transfer_destination ?? null,
    user_sentiment: row.user_sentiment,
    call_successful: row.call_successful,
    in_voicemail: row.in_voicemail ?? null,
    combined_cost_cents: row.combined_cost_cents,
    cost_breakdown: (raw?.call_cost?.product_costs ?? []).map((p) => ({ product: p.product, cost_cents: p.cost })),
    summary: row.call_summary ?? raw?.call_analysis?.call_summary ?? null,
    recording_url: row.recording_url ?? raw?.recording_url ?? null,
    public_log_url: row.public_log_url ?? raw?.public_log_url ?? null,
    transcript,
    tool_events,
    dynamic_variables: raw?.retell_llm_dynamic_variables ?? {},
    collected_variables: raw?.collected_dynamic_variables ?? {},
    metadata: raw?.metadata ?? {},
    custom_analysis: row.custom_analysis ?? raw?.call_analysis?.custom_analysis_data ?? {},
    latency: Object.entries(LATENCY_LABEL)
      .filter(([k]) => lat[k as keyof typeof lat]?.p50 != null)
      .map(([k, name]) => ({ name, p50: lat[k as keyof typeof lat]?.p50 ?? null, p90: lat[k as keyof typeof lat]?.p90 ?? null })),
    analysis: d,
    outcome: analysis?.outcome ?? null,
    overall_score: analysis?.overall_score ?? null,
    analysis_source: analysis?.source ?? null,
    contact_calls: input.contactCalls,
    voice_preview: !!input.voicePreview,
  };
}
