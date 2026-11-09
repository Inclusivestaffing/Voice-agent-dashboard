import type { RetellCall } from "../types";

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

/** Map a Retell call object to a row of public.calls. */
export function normalizeCall(workspaceId: string, c: RetellCall, hasDetails: boolean) {
  const transcriptText = c.transcript ??
    (c.transcript_object?.length ? c.transcript_object.map((u) => `${u.role === "agent" ? "Agent" : "User"}: ${u.content}`).join("\n") : null);
  return {
    workspace_id: workspaceId,
    call_id: c.call_id,
    agent_id: c.agent_id ?? null,
    agent_name: c.agent_name ?? null,
    agent_version: c.agent_version ?? null,
    call_type: c.call_type ?? null,
    direction: c.direction ?? null,
    call_status: c.call_status ?? null,
    from_number: c.from_number ?? null,
    to_number: c.to_number ?? null,
    start_ts: iso(c.start_timestamp),
    end_ts: iso(c.end_timestamp),
    duration_ms: c.duration_ms ?? (c.start_timestamp && c.end_timestamp ? c.end_timestamp - c.start_timestamp : null),
    disconnection_reason: c.disconnection_reason ?? null,
    transfer_destination: c.transfer_destination ?? null,
    batch_call_id: (c as { batch_call_id?: string }).batch_call_id ?? null,
    user_sentiment: c.call_analysis?.user_sentiment ?? null,
    call_successful: c.call_analysis?.call_successful ?? null,
    in_voicemail: c.call_analysis?.in_voicemail ?? null,
    call_summary: c.call_analysis?.call_summary ?? null,
    custom_analysis: c.call_analysis?.custom_analysis_data ?? null,
    metadata: c.metadata ?? null,
    dynamic_variables: { ...(c.retell_llm_dynamic_variables ?? {}), ...(c.collected_dynamic_variables ?? {}) },
    combined_cost_cents: c.call_cost?.combined_cost ?? null,
    e2e_p50_ms: c.latency?.e2e?.p50 ?? null,
    e2e_p90_ms: c.latency?.e2e?.p90 ?? null,
    llm_p50_ms: c.latency?.llm?.p50 ?? null,
    tts_p50_ms: c.latency?.tts?.p50 ?? null,
    asr_p50_ms: c.latency?.asr?.p50 ?? null,
    recording_url: c.recording_url ?? null,
    recording_multi_channel_url: c.recording_multi_channel_url ?? null,
    public_log_url: c.public_log_url ?? null,
    ...(hasDetails ? { transcript_text: transcriptText } : {}),
    has_details: hasDetails,
    raw: c,
    synced_at: new Date().toISOString(),
  };
}
