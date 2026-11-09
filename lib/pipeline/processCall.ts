import "server-only";
import { supabaseAdmin } from "../db/supabase";
import { fetchCallDetails } from "../retell/sync";
import { computeTiming, type Segment, type TimingMetrics, type TimelineEvent } from "../metrics/timing";
import { analyzeRecording, type AudioMetrics } from "../metrics/audio";
import { preClassify, type RuleResult } from "../metrics/classify";
import { analyzeCall, overallScore, type AnalyzeInput } from "../ai/analyzeCall";
import { PROMPT_VERSION, type CallDiagnosis } from "../ai/schemas";
import type { CallRow, RetellCall } from "../types";

export function describeBusinessHours(bh: Record<string, [number, number]> | null | undefined, tz: string): string {
  if (!bh) return "Not specified";
  const fmt = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return days.map((d) => `${d}: ${bh[d] ? `${fmt(bh[d][0])}-${fmt(bh[d][1])}` : "closed"}`).join(", ") + ` (${tz})`;
}

/** Prepare everything the AI needs for one call; computes and stores timing + audio metrics. */
export async function prepareCall(workspaceId: string, callId: string): Promise<{
  call: RetellCall; segments: Segment[]; timing: TimingMetrics; events: TimelineEvent[];
  audio: AudioMetrics | null; rule: RuleResult | null; input: AnalyzeInput;
}> {
  const db = supabaseAdmin();
  const { data: row } = await db.from("calls").select("*").eq("workspace_id", workspaceId).eq("call_id", callId).single<CallRow>();
  let call: RetellCall = row?.raw as RetellCall;
  if (!row || !row.has_details) call = await fetchCallDetails(workspaceId, callId);

  const { metrics: timing, events, segments } = computeTiming(call);

  let audio: AudioMetrics | null = null;
  let audioError: string | null = null;
  const recording = call.recording_multi_channel_url ?? call.recording_url;
  if (recording && process.env.AUDIO_ANALYSIS !== "off" && (call.duration_ms ?? 0) > 0) {
    try {
      audio = await analyzeRecording(recording, segments);
    } catch (e) {
      audioError = e instanceof Error ? e.message.slice(0, 500) : String(e);
    }
  }

  await db.from("call_metrics").upsert({
    workspace_id: workspaceId,
    call_id: callId,
    ...timing,
    audio_analyzed: !!audio,
    audio_user_speech_s: audio?.user_speech_s ?? null,
    audio_agent_speech_s: audio?.agent_speech_s ?? null,
    audio_user_peak_db: audio?.user_peak_db ?? null,
    audio_user_noise_db: audio?.user_noise_db ?? null,
    audio_clipping_pct: audio?.clipping_pct ?? null,
    audio_error: audioError,
    computed_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,call_id" });

  const rule = preClassify(call, timing, audio);

  const [{ data: ws }, { data: agent }] = await Promise.all([
    db.from("workspaces").select("success_definition, business_hours, timezone").eq("id", workspaceId).single(),
    call.agent_id
      ? db.from("agents").select("prompt_text").eq("workspace_id", workspaceId).eq("agent_id", call.agent_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const input: AnalyzeInput = {
    call, segments, timing, events, audio,
    agentPrompt: (agent as { prompt_text?: string } | null)?.prompt_text ?? null,
    successDefinition: ws?.success_definition ?? "The caller's request was completed.",
    businessHours: describeBusinessHours(ws?.business_hours, ws?.timezone ?? "UTC"),
  };
  return { call, segments, timing, events, audio, rule, input };
}

export function ruleToDiagnosis(r: RuleResult): CallDiagnosis {
  return {
    outcome: r.outcome,
    caller_intent: r.outcome === "spam" ? "Automated / sales call" : "Unknown — caller did not engage",
    intent_category: r.outcome === "spam" ? "spam" : "other",
    success: false,
    success_reason: r.reason,
    plain_english_summary: r.reason,
    what_worked: [],
    what_failed: r.what_failed.map((point) => ({ point, turn: -1, at_s: -1 })),
    root_causes: [r.root_cause],
    primary_root_cause: r.root_cause,
    severity: r.root_cause === "none" || r.outcome === "spam" ? "none" : "low",
    recommended_fix: r.recommended_fix,
    prompt_change_suggestion: "",
    scorecard: { intent_understanding: 3, information_accuracy: 3, flow_efficiency: 3, tone_and_empathy: 3, task_completion: 3, instruction_compliance: 3 },
    captured: { caller_name: "", callback_number: "", appointment: "", other_details: "" },
    followup_required: false,
    followup_note: "",
  };
}

export async function saveDiagnosis(workspaceId: string, callId: string, d: CallDiagnosis, meta: {
  source: "rules" | "llm"; model?: string | null; input_tokens?: number | null; output_tokens?: number | null;
}) {
  const { error } = await supabaseAdmin().from("call_analyses").upsert({
    workspace_id: workspaceId,
    call_id: callId,
    outcome: d.outcome,
    success: d.success,
    severity: d.severity,
    primary_root_cause: d.primary_root_cause,
    root_causes: d.root_causes,
    overall_score: meta.source === "llm" ? overallScore(d) : null,
    analysis: d,
    source: meta.source,
    model: meta.model ?? null,
    prompt_version: PROMPT_VERSION,
    input_tokens: meta.input_tokens ?? null,
    output_tokens: meta.output_tokens ?? null,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,call_id" });
  if (error) throw new Error(error.message);
}

/** Full pipeline for one call: details → timing → audio → rules → Claude. */
export async function processCall(workspaceId: string, callId: string) {
  const prep = await prepareCall(workspaceId, callId);
  if (prep.call.call_status === "ongoing" || prep.call.call_status === "registered") return { skipped: "call not finished" };
  if (prep.rule) {
    await saveDiagnosis(workspaceId, callId, ruleToDiagnosis(prep.rule), { source: "rules" });
    return { outcome: prep.rule.outcome, source: "rules" };
  }
  const res = await analyzeCall(prep.input);
  await saveDiagnosis(workspaceId, callId, res.diagnosis, {
    source: "llm", model: res.model,
    input_tokens: (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
    output_tokens: res.usage.output_tokens,
  });
  return { outcome: res.diagnosis.outcome, source: "llm" };
}

/** Process up to `limit` pending calls with bounded concurrency inside a time budget. */
export async function processPending(workspaceId: string, opts: { limit?: number; concurrency?: number; budgetMs?: number } = {}) {
  const { limit = 25, concurrency = 4, budgetMs = 240_000 } = opts;
  const started = Date.now();
  const { data } = await supabaseAdmin().rpc("pending_calls", { ws: workspaceId, version: PROMPT_VERSION, lim: limit });
  const queue = ((data ?? []) as { call_id: string }[]).map((r) => r.call_id);
  const results: { call_id: string; ok: boolean; error?: string }[] = [];
  async function worker() {
    while (queue.length && Date.now() - started < budgetMs) {
      const id = queue.shift()!;
      try {
        await processCall(workspaceId, id);
        results.push({ call_id: id, ok: true });
      } catch (e) {
        results.push({ call_id: id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { processed: results.length, failed: results.filter((r) => !r.ok), remaining: queue.length };
}
