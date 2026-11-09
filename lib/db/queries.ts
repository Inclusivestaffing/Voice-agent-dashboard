import "server-only";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabase";
import { effectiveRole, isRole, VIEW_AS_COOKIE, type Role } from "../roles";
import { SAFE_KEY, type Filters } from "../filters";

const AGENT_ID = /^[A-Za-z0-9_-]{1,80}$/;
import type { AnalyticsCall } from "../metrics/aggregate";
import type { Outcome } from "../types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Workspace {
  id: string; name: string; slug: string; logo_url: string | null;
  brand_primary: string; brand_ink: string; timezone: string;
  business_hours: Record<string, [number, number]>; success_definition: string;
  agent_display_name: string | null;
}

export async function requireUser() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, user };
}

export async function getWorkspace(slug: string) {
  const { db, user } = await requireUser();
  const { data: ws } = await db.from("workspaces").select("*").eq("slug", slug).maybeSingle<Workspace>();
  if (!ws) notFound();
  const { data: member } = await db.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", user.id).maybeSingle();
  const actualRole: Role = isRole(member?.role) ? member.role : "client";
  // `role` drives the UI and honours the "View as" preview (which can only lower access).
  // Server actions re-check the real role from the database, so the cookie never grants anything.
  const role = effectiveRole(actualRole, (await cookies()).get(VIEW_AS_COOKIE)?.value);
  return { db, user, ws, role, actualRole };
}

const ANALYTICS_COLUMNS = `call_id, start_ts, end_ts, duration_ms, agent_id, agent_name, agent_version, call_type, direction,
  call_status, disconnection_reason, user_sentiment, call_successful, in_voicemail, combined_cost_cents, e2e_p50_ms,
  e2e_p90_ms, from_number, to_number, custom_analysis, call_summary, batch_call_id, transfer_destination`;

const ANALYSIS_COLUMNS = "outcome, primary_root_cause, root_causes, overall_score, severity, success, analysis";
const METRIC_COLUMNS = "interruptions, agent_interruptions, dead_air_pct, overtalk_pct, time_to_first_word_s, avg_response_gap_s, longest_silence_s, talk_ratio, repetition_count, tool_calls, tool_failures, longest_agent_monologue_s, audio_user_speech_s";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: Filters, opts: { analysisJoined: boolean }) {
  q = q.gte("start_ts", f.from).lte("start_ts", f.to);
  if (f.agent.length) q = q.in("agent_id", f.agent);
  if (f.version.length) {
    // Values are interpolated into a PostgREST `or` expression, so only allow strict identifiers/integers.
    const ors = f.version
      .map((v) => v.split(":"))
      .filter(([a, ver]) => AGENT_ID.test(a ?? "") && /^\d{1,6}$/.test(ver ?? ""))
      .map(([a, ver]) => `and(agent_id.eq.${a},agent_version.eq.${Number(ver)})`);
    if (ors.length) q = q.or(ors.join(","));
  }
  if (f.direction.length) q = q.in("direction", f.direction);
  if (f.callType.length) q = q.in("call_type", f.callType);
  if (f.callId) q = q.eq("call_id", f.callId);
  if (f.transferTo) q = q.ilike("transfer_destination", `%${f.transferTo.replace(/[%_,()]/g, "")}%`);
  if (f.batchCallId) q = q.eq("batch_call_id", f.batchCallId);
  if (f.status.length) q = q.in("call_status", f.status);
  if (f.sentiment.length) q = q.in("user_sentiment", f.sentiment);
  if (f.success) q = q.eq("call_successful", f.success === "true");
  if (f.disconnection.length) q = q.in("disconnection_reason", f.disconnection);
  if (f.minDur !== undefined) q = q.gte("duration_ms", f.minDur * 1000);
  if (f.maxDur !== undefined) q = q.lte("duration_ms", f.maxDur * 1000);
  if (f.minCost !== undefined) q = q.gte("combined_cost_cents", f.minCost * 100);
  if (f.maxCost !== undefined) q = q.lte("combined_cost_cents", f.maxCost * 100);
  if (f.minLatency !== undefined) q = q.gte("e2e_p50_ms", f.minLatency);
  if (f.maxLatency !== undefined) q = q.lte("e2e_p50_ms", f.maxLatency);
  if (f.fromNumber) q = q.ilike("from_number", `%${f.fromNumber.replace(/[%_]/g, "")}%`);
  if (f.toNumber) q = q.ilike("to_number", `%${f.toNumber.replace(/[%_]/g, "")}%`);
  if (f.q) q = q.textSearch("transcript_tsv", f.q, { type: "websearch", config: "english" });
  for (const [k, v] of Object.entries(f.custom)) if (SAFE_KEY.test(k)) q = q.eq(`custom_analysis->>${k}`, v);
  for (const [k, v] of Object.entries(f.metadata)) if (SAFE_KEY.test(k)) q = q.eq(`metadata->>${k}`, v);
  for (const [k, v] of Object.entries(f.dynVars)) if (SAFE_KEY.test(k)) q = q.eq(`dynamic_variables->>${k}`, v);
  if (opts.analysisJoined) {
    if (f.outcome.length) q = q.in("call_analyses.outcome", f.outcome);
    if (f.rootCause.length) q = q.in("call_analyses.primary_root_cause", f.rootCause);
    if (f.minScore !== undefined) q = q.gte("call_analyses.overall_score", f.minScore);
    if (f.maxScore !== undefined) q = q.lte("call_analyses.overall_score", f.maxScore);
  }
  return q;
}

function needsInnerAnalysis(f: Filters) {
  return f.outcome.length > 0 || f.rootCause.length > 0 || f.minScore !== undefined || f.maxScore !== undefined;
}

export type AnalyticsCallFull = AnalyticsCall & { call_summary?: string | null; analysis?: Record<string, unknown> | null };

/** Load every call matching the filters (paged in chunks of 1000) for aggregation. */
export async function loadAnalyticsCalls(db: SupabaseClient, workspaceId: string, f: Filters, opts: { withAnalysis?: boolean } = {}): Promise<AnalyticsCallFull[]> {
  const inner = needsInnerAnalysis(f);
  const analysisCols = opts.withAnalysis ? ANALYSIS_COLUMNS : "outcome, primary_root_cause, root_causes, overall_score, severity";
  const select = `${ANALYTICS_COLUMNS}, call_analyses${inner ? "!inner" : ""}(${analysisCols}), call_metrics(${METRIC_COLUMNS})`;
  const out: AnalyticsCallFull[] = [];
  for (let page = 0; page < 50; page++) {
    let q = db.from("calls").select(select).eq("workspace_id", workspaceId);
    q = applyFilters(q, f, { analysisJoined: inner });
    const { data, error } = await q.order("start_ts", { ascending: false }).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of rows) out.push(flatten(r));
    if (rows.length < 1000) break;
  }
  return out;
}

function one<T>(x: T | T[] | null | undefined): T | null {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null);
}

function flatten(r: Record<string, unknown>): AnalyticsCallFull {
  const a = one(r.call_analyses as Record<string, unknown> | Record<string, unknown>[] | null) as Record<string, unknown> | null;
  const m = one(r.call_metrics as Record<string, unknown> | Record<string, unknown>[] | null) as Record<string, unknown> | null;
  const { call_analyses: _a, call_metrics: _m, ...rest } = r;
  void _a; void _m;
  return {
    ...(rest as unknown as AnalyticsCall),
    call_summary: (rest.call_summary as string) ?? null,
    outcome: (a?.outcome as Outcome) ?? null,
    primary_root_cause: (a?.primary_root_cause as string) ?? null,
    root_causes: (a?.root_causes as string[]) ?? null,
    overall_score: (a?.overall_score as number) ?? null,
    severity: (a?.severity as string) ?? null,
    analysis: (a?.analysis as Record<string, unknown>) ?? null,
    m: m as AnalyticsCall["m"],
  };
}

/** Paged list for the calls table. */
export async function listCalls(db: SupabaseClient, workspaceId: string, f: Filters, page: number, pageSize = 50, sort = "start_ts", dir: "asc" | "desc" = "desc") {
  const inner = needsInnerAnalysis(f);
  const select = `${ANALYTICS_COLUMNS}, recording_url, call_analyses${inner ? "!inner" : ""}(outcome, primary_root_cause, overall_score, severity, analysis), call_metrics(interruptions, dead_air_pct)`;
  let q = db.from("calls").select(select, { count: "exact" }).eq("workspace_id", workspaceId);
  q = applyFilters(q, f, { analysisJoined: inner });
  const sortable = new Set(["start_ts", "duration_ms", "combined_cost_cents", "e2e_p50_ms", "user_sentiment", "from_number", "disconnection_reason"]);
  q = q.order(sortable.has(sort) ? sort : "start_ts", { ascending: dir === "asc", nullsFirst: false });
  const { data, count, error } = await q.range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ ...flatten(r), recording_url: r.recording_url as string | null })), total: count ?? 0 };
}

/** Values for filter dropdowns (agents, versions, disconnection reasons, custom keys). */
export async function filterOptions(db: SupabaseClient, workspaceId: string) {
  const [{ data: agents }, { data: recent }] = await Promise.all([
    db.from("agents").select("agent_id, agent_name, latest_version").eq("workspace_id", workspaceId).order("agent_name"),
    db.from("calls").select("agent_id, agent_name, agent_version, disconnection_reason, custom_analysis, metadata, dynamic_variables")
      .eq("workspace_id", workspaceId).order("start_ts", { ascending: false }).limit(1000),
  ]);
  const versions = new Map<string, string>();
  const disconnections = new Set<string>();
  const customKeys = new Map<string, Set<string>>();
  const metaKeys = new Map<string, Set<string>>();
  const dynKeys = new Map<string, Set<string>>();
  const collect = (target: Map<string, Set<string>>, obj: unknown) => {
    for (const [k, v] of Object.entries((obj ?? {}) as Record<string, unknown>)) {
      if (v === null || typeof v === "object" || !SAFE_KEY.test(k)) continue;
      if (!target.has(k)) target.set(k, new Set());
      const set = target.get(k)!;
      if (set.size < 30) set.add(String(v).slice(0, 80));
    }
  };
  const agentMap = new Map<string, string>();
  for (const a of agents ?? []) agentMap.set(a.agent_id, a.agent_name ?? a.agent_id);
  for (const r of recent ?? []) {
    if (r.agent_id) {
      if (!agentMap.has(r.agent_id)) agentMap.set(r.agent_id, r.agent_name ?? r.agent_id);
      if (r.agent_version != null) versions.set(`${r.agent_id}:${r.agent_version}`, `${r.agent_name ?? r.agent_id} v${r.agent_version}`);
    }
    if (r.disconnection_reason) disconnections.add(r.disconnection_reason);
    collect(customKeys, r.custom_analysis);
    collect(metaKeys, r.metadata);
    collect(dynKeys, r.dynamic_variables);
  }
  return {
    agents: [...agentMap.entries()].map(([id, name]) => ({ id, name })),
    versions: [...versions.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    disconnections: [...disconnections].sort(),
    customFields: [...customKeys.entries()].map(([key, vals]) => ({ key, values: [...vals].sort() })),
    metadataFields: [...metaKeys.entries()].map(([key, vals]) => ({ key, values: [...vals].sort() })),
    dynamicFields: [...dynKeys.entries()].map(([key, vals]) => ({ key, values: [...vals].sort() })),
  };
}
