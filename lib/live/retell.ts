import "server-only";
import { createHash } from "node:crypto";
import { retellClient } from "../retell/client";
import { normalizeCall } from "../retell/normalize";
import { preClassify } from "../metrics/classify";
import { computeTiming } from "../metrics/timing";
import type { Outcome, RetellCall } from "../types";
import type { DemoCall } from "../demo/openWater";
import type { LiveConn } from "./conn";

/* Small in-memory cache so moving between pages doesn't re-download the same calls. */
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return value;
}
const keyId = (apiKey: string) => createHash("sha256").update(apiKey).digest("hex").slice(0, 16);

export interface LiveAgent { agent_id: string; agent_name: string; version: number | null }

/** Agents in the Retell account (latest version of each). */
export function liveAgents(conn: Pick<LiveConn, "apiKey">): Promise<LiveAgent[]> {
  return cached(`agents:${keyId(conn.apiKey)}`, 5 * 60_000, async () => {
    const res = await retellClient(conn.apiKey).agent.list({ limit: 1000 });
    const byId = new Map<string, LiveAgent>();
    for (const a of res.items as unknown as { agent_id: string; agent_name?: string | null; version?: number }[]) {
      const prev = byId.get(a.agent_id);
      if (!prev || (a.version ?? 0) > (prev.version ?? 0)) byId.set(a.agent_id, { agent_id: a.agent_id, agent_name: a.agent_name || a.agent_id, version: a.version ?? null });
    }
    return [...byId.values()].sort((a, b) => a.agent_name.localeCompare(b.agent_name));
  });
}

/** Outcome from the list payload alone (no transcript): Retell's own signals, no AI. */
function quickOutcome(c: RetellCall): Outcome | null {
  const reason = c.disconnection_reason ?? "";
  const dur = (c.duration_ms ?? 0) / 1000;
  if (c.call_status === "error" || c.call_status === "not_connected" || reason.startsWith("error") || reason.startsWith("dial_")) return "no_data";
  if (c.call_analysis?.in_voicemail || reason === "voicemail_reached") return "voicemail";
  if (reason === "marked_as_spam" || reason === "scam_detected" || reason === "ivr_reached") return "spam";
  if (reason === "transfer_bridged" || reason === "call_transfer") return "transfer_ok";
  if (reason === "transfer_cancelled") return "transfer_fail";
  if (dur > 0 && dur <= 10 && c.call_analysis?.call_successful !== true) return "silent";
  if (c.call_analysis?.call_successful === true) return "info";
  return null;
}

/** Shape a Retell call into the row the dashboards use. */
export function toRow(c: RetellCall, agentNames: Map<string, string>, withTranscript = false): DemoCall {
  const n = normalizeCall("live", c, withTranscript);
  let outcome = quickOutcome(c);
  if (withTranscript) {
    const rule = preClassify(c, computeTiming(c).metrics);
    if (rule) outcome = rule.outcome;
  }
  return {
    call_id: n.call_id, start_ts: n.start_ts, end_ts: n.end_ts, duration_ms: n.duration_ms,
    agent_id: n.agent_id, agent_name: n.agent_name ?? (n.agent_id ? agentNames.get(n.agent_id) ?? null : null), agent_version: n.agent_version,
    call_type: n.call_type, direction: n.direction, call_status: n.call_status, disconnection_reason: n.disconnection_reason,
    user_sentiment: n.user_sentiment, call_successful: n.call_successful, in_voicemail: n.in_voicemail,
    combined_cost_cents: n.combined_cost_cents, e2e_p50_ms: n.e2e_p50_ms, e2e_p90_ms: n.e2e_p90_ms,
    from_number: n.from_number, to_number: n.to_number, batch_call_id: n.batch_call_id, transfer_destination: n.transfer_destination,
    custom_analysis: (n.custom_analysis as Record<string, unknown> | null) ?? null,
    metadata: (n.metadata as Record<string, unknown> | null) ?? null,
    dynamic_variables: n.dynamic_variables as Record<string, unknown>,
    outcome, primary_root_cause: null, root_causes: null, overall_score: null, severity: null, m: null,
    analysis: null, call_summary: n.call_summary,
  } as DemoCall;
}

/** Every call for the connected agents that started in [fromIso, toIso]. Up to 5,000 per window. */
export function liveCalls(conn: LiveConn, fromIso: string, toIso: string): Promise<DemoCall[]> {
  const fromMs = Date.parse(fromIso), toMs = Date.parse(toIso);
  const key = `calls:${keyId(conn.apiKey)}:${conn.agentIds.join(",")}:${Math.floor(fromMs / 60_000)}:${Math.floor(toMs / 60_000)}`;
  return cached(key, 60_000, async () => {
    const client = retellClient(conn.apiKey);
    const agents = await liveAgents(conn).catch(() => [] as LiveAgent[]);
    const names = new Map(agents.map((a) => [a.agent_id, a.agent_name]));
    const out: DemoCall[] = [];
    let pagination_key: string | undefined;
    for (let page = 0; page < 5; page++) {
      const res = await client.call.list({
        filter_criteria: {
          start_timestamp: { type: "range", op: "bt", value: [fromMs, toMs] },
          ...(conn.agentIds.length ? { agent: conn.agentIds.map((agent_id) => ({ agent_id })) } : {}),
        },
        limit: 1000,
        sort_order: "descending",
        ...(pagination_key ? { pagination_key } : {}),
      });
      for (const c of res.items as unknown as RetellCall[]) out.push(toRow(c, names));
      if (!res.has_more || !res.pagination_key) break;
      pagination_key = res.pagination_key;
    }
    return out;
  });
}

/** Full call (transcript, recording, latency) — only if it belongs to one of the connected agents. */
export function liveCall(conn: LiveConn, callId: string): Promise<RetellCall | null> {
  return cached(`call:${keyId(conn.apiKey)}:${callId}`, 5 * 60_000, async () => {
    try {
      const c = (await retellClient(conn.apiKey).call.retrieve(callId)) as unknown as RetellCall;
      if (conn.agentIds.length && !conn.agentIds.includes(c.agent_id ?? "")) return null;
      return c;
    } catch {
      return null;
    }
  });
}
