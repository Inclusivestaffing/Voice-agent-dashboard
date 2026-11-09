import "server-only";
import type Retell from "retell-sdk";
import { supabaseAdmin } from "../db/supabase";
import { retellForWorkspace } from "./client";
import { normalizeCall } from "./normalize";
import type { RetellCall } from "../types";

/**
 * Pull calls from Retell (v3 list-calls, cursor-paginated, 1000 per page) for a time
 * window and upsert them. The list payload omits transcripts/recordings; those are
 * fetched per call by the processing pipeline (fetchCallDetails).
 */
export async function syncCalls(workspaceId: string, opts: { fromMs: number; toMs?: number; kind: "backfill" | "incremental" }) {
  const db = supabaseAdmin();
  const client = await retellForWorkspace(workspaceId);
  const { data: run } = await db.from("sync_runs").insert({ workspace_id: workspaceId, kind: opts.kind }).select("id").single();
  let seen = 0, upserted = 0;
  try {
    await syncAgents(workspaceId, client);
    let pagination_key: string | undefined;
    do {
      const page = await client.call.list({
        filter_criteria: {
          start_timestamp: { type: "range", op: "bt", value: [opts.fromMs, opts.toMs ?? Date.now()] },
        },
        limit: 1000,
        sort_order: "descending",
        ...(pagination_key ? { pagination_key } : {}),
      });
      const items = page.items as unknown as RetellCall[];
      seen += items.length;
      if (items.length) {
        // Don't clobber rows that already have full details with the slimmer list payload.
        const ids = items.map((c) => c.call_id);
        const { data: existing } = await db.from("calls").select("call_id, has_details, call_status")
          .eq("workspace_id", workspaceId).in("call_id", ids);
        const detailed = new Set((existing ?? []).filter((r) => r.has_details && r.call_status === "ended").map((r) => r.call_id));
        const rows = items.filter((c) => !detailed.has(c.call_id)).map((c) => normalizeCall(workspaceId, c, false));
        if (rows.length) {
          const { error } = await db.from("calls").upsert(rows, { onConflict: "workspace_id,call_id" });
          if (error) throw new Error(error.message);
          upserted += rows.length;
        }
      }
      pagination_key = page.has_more ? page.pagination_key : undefined;
    } while (pagination_key);

    await db.from("retell_connections").update({ last_synced_at: new Date().toISOString(), last_sync_error: null }).eq("workspace_id", workspaceId);
    await db.from("sync_runs").update({ finished_at: new Date().toISOString(), calls_seen: seen, calls_upserted: upserted }).eq("id", run!.id);
    return { seen, upserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("retell_connections").update({ last_sync_error: msg }).eq("workspace_id", workspaceId);
    await db.from("sync_runs").update({ finished_at: new Date().toISOString(), calls_seen: seen, calls_upserted: upserted, error: msg }).eq("id", run!.id);
    throw e;
  }
}

/** Fetch the full call object (transcript, words, tool calls, recordings, latency). */
export async function fetchCallDetails(workspaceId: string, callId: string, client?: Retell): Promise<RetellCall> {
  const c = client ?? (await retellForWorkspace(workspaceId));
  const call = (await c.call.retrieve(callId)) as unknown as RetellCall;
  const { error } = await supabaseAdmin().from("calls")
    .upsert(normalizeCall(workspaceId, call, call.call_status === "ended"), { onConflict: "workspace_id,call_id" });
  if (error) throw new Error(error.message);
  return call;
}

/**
 * Cache every agent and its intended behaviour (LLM prompt or conversation-flow
 * instructions). The AI judge compares what happened on the call to this.
 */
export async function syncAgents(workspaceId: string, client: Retell) {
  const db = supabaseAdmin();
  const res = await client.agent.list({ limit: 1000 });
  for (const a of res.items as unknown as { agent_id: string; agent_name?: string | null; version: number; response_engine: Record<string, unknown> }[]) {
    let prompt: string | null = null;
    try {
      const engine = a.response_engine;
      if (engine.type === "retell-llm") {
        const llm = await client.llm.retrieve(String(engine.llm_id));
        const states = (llm.states ?? []).map((s) => `## State: ${s.name}\n${s.state_prompt ?? ""}`).join("\n\n");
        prompt = [llm.begin_message && `Begin message: ${llm.begin_message}`, llm.general_prompt, states].filter(Boolean).join("\n\n");
      } else if (engine.type === "conversation-flow") {
        const flow = await client.conversationFlow.retrieve(String(engine.conversation_flow_id));
        const nodes = ((flow as unknown as { nodes?: { name?: string; type?: string; instruction?: { text?: string } }[] }).nodes ?? [])
          .map((n) => `## Node: ${n.name ?? n.type}\n${n.instruction?.text ?? ""}`).join("\n\n");
        prompt = [flow.global_prompt, nodes].filter(Boolean).join("\n\n");
      } else {
        prompt = "Custom LLM agent — prompt is hosted outside Retell.";
      }
    } catch {
      // Prompt is optional context; never block a sync on it.
    }
    await db.from("agents").upsert({
      workspace_id: workspaceId,
      agent_id: a.agent_id,
      agent_name: a.agent_name ?? null,
      latest_version: a.version,
      response_engine: a.response_engine,
      prompt_text: prompt ? prompt.slice(0, 60_000) : null,
      prompt_fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,agent_id" });
  }
}
