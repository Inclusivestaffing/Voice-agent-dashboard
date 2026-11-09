import "server-only";
import { supabaseAdmin } from "../db/supabase";
import { anthropic, batchRequestParams, parseDiagnosisText } from "../ai/analyzeCall";
import { PROMPT_VERSION } from "../ai/schemas";
import { prepareCall, ruleToDiagnosis, saveDiagnosis } from "./processCall";

/**
 * Bulk analysis for backfills via the Message Batches API (50% cheaper, async).
 * Rule-classifiable calls are saved immediately; the rest go into one batch.
 */
export async function submitAnalysisBatch(workspaceId: string, limit = 500) {
  const db = supabaseAdmin();
  const { data } = await db.rpc("pending_calls", { ws: workspaceId, version: PROMPT_VERSION, lim: limit });
  const ids = ((data ?? []) as { call_id: string }[]).map((r) => r.call_id);
  const requests: { custom_id: string; params: ReturnType<typeof batchRequestParams> }[] = [];
  let ruled = 0;
  for (const id of ids) {
    try {
      const prep = await prepareCall(workspaceId, id);
      if (prep.rule) {
        await saveDiagnosis(workspaceId, id, ruleToDiagnosis(prep.rule), { source: "rules" });
        ruled++;
      } else if (prep.call.call_status === "ended") {
        // custom_id must be ≤64 chars and [a-zA-Z0-9_-]; Retell call ids fit.
        requests.push({ custom_id: id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64), params: batchRequestParams(prep.input) });
      }
    } catch {
      // Skip calls we can't prepare now; they stay pending for the next run.
    }
  }
  if (!requests.length) return { batch_id: null, queued: 0, ruled };
  const batch = await anthropic().messages.batches.create({ requests });
  await db.from("ai_batches").insert({ id: batch.id, workspace_id: workspaceId, call_ids: requests.map((r) => r.custom_id) });
  return { batch_id: batch.id, queued: requests.length, ruled };
}

/** Poll in-progress batches and store any finished results. */
export async function collectBatches() {
  const db = supabaseAdmin();
  const { data: open } = await db.from("ai_batches").select("id, workspace_id, call_ids").eq("status", "in_progress");
  const summary: { id: string; status: string; saved: number }[] = [];
  for (const b of open ?? []) {
    const batch = await anthropic().messages.batches.retrieve(b.id);
    if (batch.processing_status !== "ended") { summary.push({ id: b.id, status: batch.processing_status, saved: 0 }); continue; }
    let saved = 0;
    const idMap = new Map<string, string>((b.call_ids as string[]).map((c) => [c, c]));
    for await (const r of await anthropic().messages.batches.results(b.id)) {
      if (r.result.type !== "succeeded") continue;
      try {
        const d = parseDiagnosisText(r.result.message);
        const u = r.result.message.usage;
        await saveDiagnosis(b.workspace_id, idMap.get(r.custom_id) ?? r.custom_id, d, {
          source: "llm", model: r.result.message.model,
          input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          output_tokens: u.output_tokens,
        });
        saved++;
      } catch {
        // Malformed result: leave the call pending so the realtime path retries it.
      }
    }
    await db.from("ai_batches").update({ status: "ended", completed_at: new Date().toISOString() }).eq("id", b.id);
    summary.push({ id: b.id, status: "ended", saved });
  }
  return summary;
}
