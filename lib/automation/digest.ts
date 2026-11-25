import "server-only";
import { randomBytes } from "node:crypto";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic } from "../ai/analyzeCall";
import { REPORT_MODEL } from "../ai/schemas";
import { decrypt, encrypt } from "../crypto";
import { getHumanlikeMany } from "../humanlike/store";
import { isResult } from "../humanlike/schema";
import { notifyDigest, notifySystem, signalsFromRaw, signalsFromRow } from "../inbox/notify";
import type { LiveWorkspace } from "../live/conn";
import { liveCall, liveCalls } from "../live/retell";
import { hasServerStore, storeDel, storeGet, storeLPush, storeLRange, storeLTrim, storeMGet, storeSet, storeSetEx, storeSetNx } from "../live/store";
import { retellClient } from "../retell/client";
import type { RetellCall } from "../types";
import { getAutomationSettings } from "./settings";
import { snapshotFromCalls } from "../reports/snapshot";
import { summarizeHumanlike } from "../humanlike/summary";
import {
  DIGEST_SYSTEM, buildDigestPrompt, chooseTranscriptCalls, computeStats, ruleNarrative, transcriptText, validateNarrative,
  type AgentPrompt, type DigestCall,
} from "./prompt";
import { DigestNarrative, type CallRef, type DigestRun } from "./types";

/**
 * Scheduled analysis ("Automation"): every call of the period, with transcripts, each call's audio
 * and quality analysis, and the agent's prompt, reviewed by Claude Opus 5.5 for what to change.
 * Results are stored per workspace (encrypted) and announced in the inbox.
 */
const runKey = (ws: string, id: string) => `va:auto:run:${ws}:${id}`;
const runsList = (ws: string) => `va:auto:runs:${ws}`;
const lastKey = (ws: string) => `va:auto:last:${ws}`;
const RUN_TTL_S = 180 * 86400;
const MAX_TRANSCRIPTS = 150;
const STALE_MS = 10 * 60_000;
export const RUN_ID = /^r_[a-z0-9]{6,32}$/;

function parse(raw: string | null | undefined): DigestRun | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)) as DigestRun; } catch { return null; }
}
/** A run that never finished (the server was stopped) reads as failed. */
const settle = (r: DigestRun): DigestRun =>
  r.status === "running" && Date.now() - Date.parse(r.started_at) > STALE_MS ? { ...r, status: "failed", error: "The run didn't finish in time. Try Run now again." } : r;

async function saveRun(run: DigestRun, isNew = false) {
  await storeSetEx(runKey(run.ws, run.id), encrypt(JSON.stringify(run)), RUN_TTL_S);
  if (isNew) { await storeLPush(runsList(run.ws), run.id); await storeLTrim(runsList(run.ws), 0, 29); }
}

export async function getRun(ws: string, id: string): Promise<DigestRun | null> {
  if (!hasServerStore() || !RUN_ID.test(id)) return null;
  try { const r = parse(await storeGet(runKey(ws, id))); return r ? settle(r) : null; } catch { return null; }
}

export async function listRuns(ws: string, limit = 30): Promise<DigestRun[]> {
  if (!hasServerStore()) return [];
  try {
    const ids = await storeLRange(runsList(ws), 0, limit - 1);
    if (!ids.length) return [];
    return ((await storeMGet(ids.map((id) => runKey(ws, id)))) ?? []).map(parse).filter((x): x is DigestRun => !!x).map(settle);
  } catch { return []; }
}

export async function lastScheduledAt(ws: string): Promise<string | null> {
  if (!hasServerStore()) return null;
  try { return await storeGet(lastKey(ws)); } catch { return null; }
}

/** Run `fn` over `items`, `n` at a time. */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** The current prompt of the agents that took the most calls (Retell LLM agents only). */
async function agentPrompts(ws: LiveWorkspace, calls: (DigestCall & { agent_id: string | null })[]): Promise<AgentPrompt[]> {
  const byAgent = new Map<string, { n: number; name: string | null; versions: Map<number, number> }>();
  for (const c of calls) {
    const id = c.agent_id;
    if (!id) continue;
    const e = byAgent.get(id) ?? { n: 0, name: c.agent_name, versions: new Map() };
    e.n++;
    if (c.agent_version != null) e.versions.set(c.agent_version, (e.versions.get(c.agent_version) ?? 0) + 1);
    byAgent.set(id, e);
  }
  const client = retellClient(ws.apiKey);
  const top = [...byAgent.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3);
  const out: AgentPrompt[] = [];
  for (const [agentId, e] of top) {
    try {
      const version = [...e.versions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const agent = (await client.agent.retrieve(agentId, version != null ? { version } : undefined)) as unknown as {
        agent_name?: string | null; version?: number; response_engine?: { type: string; llm_id?: string; version?: number | null };
      };
      const re = agent.response_engine;
      if (re?.type !== "retell-llm" || !re.llm_id) continue;
      const llm = (await client.llm.retrieve(re.llm_id, re.version != null ? { version: re.version } : undefined)) as unknown as {
        general_prompt?: string | null; begin_message?: string | null; general_tools?: { name?: string; type?: string; description?: string }[] | null;
      };
      if (!llm.general_prompt) continue;
      out.push({
        agent_name: agent.agent_name || e.name || agentId, version: agent.version ?? version ?? null, prompt: llm.general_prompt,
        begin_message: llm.begin_message ?? null,
        tools: (llm.general_tools ?? []).map((t) => `${t.name ?? t.type}${t.description ? ` (${t.description.replace(/\s+/g, " ").slice(0, 160)})` : ""}`).slice(0, 30),
      });
    } catch (e2) {
      console.warn("automation: couldn't read the agent prompt", agentId, e2 instanceof Error ? e2.message : e2);
    }
  }
  return out;
}

const WEEKDAY_HOURS: Record<string, [number, number]> = { mon: [9, 17], tue: [9, 17], wed: [9, 17], thu: [9, 17], fri: [9, 17] };
const runId = () => `r_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
// Claude Opus 5.5 list prices per million tokens: input $4, 5-minute cache write $5, cache read $0.20, output $20.
const costUsd = (u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }) =>
  Math.round(((u.input_tokens * 4 + (u.cache_creation_input_tokens ?? 0) * 5 + (u.cache_read_input_tokens ?? 0) * 0.2 + u.output_tokens * 20) / 1e6) * 1000) / 1000;

/**
 * Run the analysis for one workspace now. Returns the finished run, or null when another run for this
 * workspace is already going. Never throws: failures are saved on the run and sent to the inbox.
 */
export async function runDigest(ws: LiveWorkspace, opts: { trigger: "schedule" | "manual"; frequency?: "daily" | "weekly" }): Promise<DigestRun | null> {
  if (!hasServerStore()) return null;
  const lock = `va:auto:lock:${ws.id}`;
  if (!(await storeSetNx(lock, "1", 330))) return null;
  const settings = await getAutomationSettings(ws.id);
  const frequency = opts.frequency ?? settings.schedule.frequency;
  const threshold = settings.alerts.threshold;
  const now = Date.now();
  const run: DigestRun = {
    id: runId(), ws: ws.id, wsName: ws.name, status: "running", trigger: opts.trigger, frequency,
    period: { from: new Date(now - (frequency === "daily" ? 1 : 7) * 86400_000).toISOString(), to: new Date(now).toISOString() },
    started_at: new Date(now).toISOString(),
  };
  try {
    await saveRun(run, true);
    if (opts.trigger === "schedule") await storeSet(lastKey(ws.id), run.started_at);

    const rows = (await liveCalls(ws, run.period.from, run.period.to)).filter((r) => r.call_status !== "ongoing" && r.call_status !== "registered");
    if (!rows.length) {
      Object.assign(run, { status: "skipped", note: "No calls in this period.", finished_at: new Date().toISOString() });
      await saveRun(run);
      return run;
    }
    const results = await getHumanlikeMany(ws.id, rows.map((r) => r.call_id));
    const calls: (DigestCall & { agent_id: string | null })[] = rows.map((r) => ({
      sig: signalsFromRow(r), agent_id: r.agent_id, agent_name: r.agent_name, agent_version: r.agent_version,
      hl: results.get(r.call_id) ?? null, transcript: null,
    }));

    // Transcripts (with tool calls) for the calls that matter most.
    const chosen = chooseTranscriptCalls(calls, threshold, MAX_TRANSCRIPTS);
    const raws = await mapLimit(chosen, 6, (c) => liveCall(ws, c.sig.call_id).catch(() => null as RetellCall | null));
    let transcripts = 0;
    chosen.forEach((c, i) => {
      const raw = raws[i];
      if (!raw) return;
      c.transcript = transcriptText(raw);
      c.sig = { ...c.sig, transfer_attempted: signalsFromRaw(raw).transfer_attempted };
      if (c.transcript) transcripts++;
    });

    const stats = computeStats(calls, threshold, transcripts, ws.timezone);
    const known = new Set(calls.map((c) => c.sig.call_id));
    let narrative: DigestNarrative;
    if (!process.env.ANTHROPIC_API_KEY) {
      narrative = ruleNarrative(stats, calls);
      Object.assign(run, { source: "rules", note: "Claude isn't connected (no ANTHROPIC_API_KEY in Vercel), so this shows the numbers and the most common fixes from the per-call analysis." });
    } else {
      const agents = await agentPrompts(ws, calls);
      const prompt = buildDigestPrompt({ workspace: ws.name, frequency, period: run.period, stats, agents, calls });
      const res = await anthropic().beta.messages.parse({
        model: REPORT_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: betaZodOutputFormat(DigestNarrative) },
        system: [{ type: "text", text: DIGEST_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
      }, { timeout: 250_000, maxRetries: 1 });
      if (res.stop_reason === "refusal") throw new Error("Claude declined to write this analysis.");
      if (!res.parsed_output) throw new Error(`The analysis came back incomplete (${res.stop_reason}).`);
      narrative = validateNarrative(res.parsed_output, known);
      Object.assign(run, { source: "claude", model: res.model, usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, cost_usd: costUsd(res.usage) } });
    }

    // Enough about each referenced call to show it (time and score), without storing transcripts.
    const ids = new Set([
      ...narrative.problems.flatMap((p) => p.example_call_ids), ...narrative.improvements.flatMap((i) => i.example_call_ids),
      ...narrative.calls_to_review.map((c) => c.call_id),
    ]);
    const refs: Record<string, CallRef> = {};
    for (const c of calls) if (ids.has(c.sig.call_id)) refs[c.sig.call_id] = { start_ts: c.sig.start_ts, score: isResult(c.hl) ? c.hl.score : null, summary: c.sig.call_summary?.slice(0, 200) ?? null };

    // Every metric for the period (the same numbers and charts as Reports), without transcripts.
    const span = Date.parse(run.period.to) - Date.parse(run.period.from);
    const prevRows = await liveCalls(ws, new Date(Date.parse(run.period.from) - span).toISOString(), run.period.from).catch(() => []);
    const agentNames = [...new Set(rows.map((r) => r.agent_name).filter(Boolean))];
    const snapshot = snapshotFromCalls({
      calls: rows, prev: prevRows, transcripts: new Map(), period: run.period, businessHours: WEEKDAY_HOURS,
      workspace: { name: ws.name, logo_url: "/inclusive-logo.png", brand_primary: "#facc15", agent_name: agentNames.length === 1 ? agentNames[0] : "Agent", timezone: ws.timezone },
    });
    snapshot.calls = snapshot.calls.slice(-400).map((c) => ({ ...c, summary: c.summary.slice(0, 240), transcript: "" }));
    const humanlike = summarizeHumanlike(rows, results, { timezone: ws.timezone, bucket: frequency === "daily" ? "hour" : "day" });

    Object.assign(run, { status: "done", stats, narrative, callRefs: refs, snapshot, humanlike, finished_at: new Date().toISOString() });
    await saveRun(run);
    await notifyDigest(run);
    return run;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("automation: run failed", ws.id, msg);
    Object.assign(run, { status: "failed", error: msg.slice(0, 400), finished_at: new Date().toISOString() });
    await saveRun(run).catch(() => {});
    await notifySystem(ws, `${frequency === "daily" ? "Daily" : "Weekly"} analysis failed`, msg, { runId: run.id });
    return run;
  } finally {
    await storeDel(lock).catch(() => {});
  }
}
