// Deterministic conversation-timing metrics computed from Retell's word-level
// timestamps (transcript_object[].words[].start/end, seconds into the call audio).
// These capture what an LLM reading plain text cannot: dead air, overtalk,
// barge-ins, slow turn-taking, monologues and loops.

import type { RetellCall, RetellUtterance } from "../types";
import { Interval, intersectLength, percentile, mean, totalLength, union } from "./stats";

export interface Segment {
  role: "agent" | "user";
  start: number;
  end: number;
  text: string;
  backchannel: boolean;
}

export interface TimingMetrics {
  turns: number;
  agent_turns: number;
  user_turns: number;
  agent_talk_s: number;
  user_talk_s: number;
  talk_ratio: number | null;
  time_to_first_word_s: number | null;
  avg_response_gap_s: number | null;
  p90_response_gap_s: number | null;
  max_response_gap_s: number | null;
  interruptions: number;
  agent_interruptions: number;
  overtalk_pct: number | null;
  dead_air_pct: number | null;
  longest_silence_s: number | null;
  longest_agent_monologue_s: number | null;
  repetition_count: number;
  tool_calls: number;
  tool_failures: number;
  user_spoke: boolean;
}

/** Timeline events for the call-detail visualisation. */
export interface TimelineEvent {
  kind: "interruption" | "agent_interruption" | "silence" | "overtalk" | "slow_response" | "repetition";
  start: number;
  end: number;
  note: string;
}

const BACKCHANNEL_RE = /^(ok(ay)?|yeah|yep|yes|yup|uh[- ]?huh|mm+[- ]?hmm*|mhm+|right|sure|got it|alright|cool|hmm+|oh)[.!?,]*$/i;
const OVERLAP_TOLERANCE_S = 0.25;   // ignore sub-quarter-second overlaps (endpointing jitter)
const SILENCE_EVENT_S = 3;          // gaps longer than this are flagged as dead air
const SLOW_RESPONSE_S = 2;          // agent taking longer than this to respond is flagged

export function isBackchannel(u: Pick<RetellUtterance, "content" | "metadata">, durationS: number): boolean {
  if (u.metadata?.is_backchannel) return true;
  const t = (u.content || "").trim();
  return durationS < 1.5 && BACKCHANNEL_RE.test(t);
}

export function toSegments(transcript: RetellUtterance[] | undefined): Segment[] {
  if (!transcript) return [];
  const segs: Segment[] = [];
  for (const u of transcript) {
    if (u.role !== "agent" && u.role !== "user") continue;
    const words = (u.words || []).filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
    if (!words.length) continue;
    const start = Math.min(...words.map((w) => w.start));
    const end = Math.max(...words.map((w) => w.end));
    const text = (u.content || "").trim();
    if (!text) continue;
    segs.push({ role: u.role, start, end, text, backchannel: u.role === "user" && isBackchannel(u, end - start) });
  }
  return segs.sort((a, b) => a.start - b.start);
}

function normalizeWords(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

export function computeTiming(call: Pick<RetellCall, "transcript_object" | "transcript_with_tool_calls" | "duration_ms">): {
  metrics: TimingMetrics;
  events: TimelineEvent[];
  segments: Segment[];
} {
  const segs = toSegments(call.transcript_object);
  const agent = segs.filter((s) => s.role === "agent");
  const user = segs.filter((s) => s.role === "user");
  const userReal = user.filter((s) => !s.backchannel);
  const events: TimelineEvent[] = [];

  const agentIv: Interval[] = agent.map((s) => [s.start, s.end]);
  const userIv: Interval[] = userReal.map((s) => [s.start, s.end]);
  const agentTalk = totalLength(agentIv);
  const userTalk = totalLength(userIv);
  const lastWordEnd = segs.length ? Math.max(...segs.map((s) => s.end)) : 0;
  // Measure dead air / overtalk over the spoken part of the call (start → last word).
  const span = lastWordEnd;

  // Overtalk: both channels speaking at once (excluding backchannels and tiny jitter).
  let overtalk = 0;
  const allUnion = union([...agentIv, ...userIv]);
  for (const a of agentIv) {
    for (const u of userIv) {
      const lo = Math.max(a[0], u[0]), hi = Math.min(a[1], u[1]);
      if (hi - lo > OVERLAP_TOLERANCE_S) {
        overtalk += hi - lo;
        events.push({ kind: "overtalk", start: lo, end: hi, note: `Both talking for ${(hi - lo).toFixed(1)}s` });
      }
    }
  }
  overtalk = Math.min(overtalk, intersectLength(agentIv, userIv));

  // Silences between speech (from first word to last word).
  let longestSilence = 0;
  let silenceTotal = 0;
  for (let i = 1; i < allUnion.length; i++) {
    const gap = allUnion[i][0] - allUnion[i - 1][1];
    if (gap > 0) {
      silenceTotal += gap;
      longestSilence = Math.max(longestSilence, gap);
      if (gap >= SILENCE_EVENT_S) {
        events.push({ kind: "silence", start: allUnion[i - 1][1], end: allUnion[i][0], note: `${gap.toFixed(1)}s of dead air` });
      }
    }
  }
  const leading = allUnion.length ? allUnion[0][0] : 0;
  const deadAirPct = span > 0 ? (silenceTotal + leading) / span : null;

  // Interruptions: someone starts while the other is mid-utterance.
  let interruptions = 0;
  let agentInterruptions = 0;
  for (const u of userReal) {
    const hit = agent.find((a) => u.start > a.start + OVERLAP_TOLERANCE_S && u.start < a.end - OVERLAP_TOLERANCE_S);
    if (hit) {
      interruptions++;
      events.push({ kind: "interruption", start: u.start, end: Math.min(u.end, hit.end), note: `Caller cut in: “${u.text.slice(0, 60)}”` });
    }
  }
  for (const a of agent) {
    const hit = userReal.find((u) => a.start > u.start + OVERLAP_TOLERANCE_S && a.start < u.end - OVERLAP_TOLERANCE_S);
    if (hit) {
      agentInterruptions++;
      events.push({ kind: "agent_interruption", start: a.start, end: Math.min(a.end, hit.end), note: `Agent talked over the caller` });
    }
  }

  // Response gaps: caller finishes → next agent speech starts.
  const gaps: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.role !== "user" || s.backchannel) continue;
    const nextAgent = segs.slice(i + 1).find((x) => x.role === "agent");
    const nextUser = segs.slice(i + 1).find((x) => x.role === "user" && !x.backchannel);
    if (!nextAgent) continue;
    if (nextUser && nextUser.start < nextAgent.start) continue; // caller kept talking
    const gap = nextAgent.start - s.end;
    if (gap > 0 && gap < 30) {
      gaps.push(gap);
      if (gap >= SLOW_RESPONSE_S) {
        events.push({ kind: "slow_response", start: s.end, end: nextAgent.start, note: `Agent took ${gap.toFixed(1)}s to respond` });
      }
    }
  }

  // Monologues: merge consecutive agent segments separated by < 0.6s.
  let longestMonologue = 0;
  let cur: Interval | null = null;
  for (const s of segs) {
    if (s.role === "agent") {
      if (cur && s.start - cur[1] < 0.6) cur[1] = Math.max(cur[1], s.end);
      else { if (cur) longestMonologue = Math.max(longestMonologue, cur[1] - cur[0]); cur = [s.start, s.end]; }
    } else if (!s.backchannel) {
      if (cur) longestMonologue = Math.max(longestMonologue, cur[1] - cur[0]);
      cur = null;
    }
  }
  if (cur) longestMonologue = Math.max(longestMonologue, cur[1] - cur[0]);

  // Repetition: an agent turn that is a near-duplicate of an earlier agent turn.
  let repetition = 0;
  const seen: Set<string>[] = [];
  for (const a of agent) {
    const w = normalizeWords(a.text);
    if (w.size >= 5 && seen.some((p) => jaccard(p, w) >= 0.7)) {
      repetition++;
      events.push({ kind: "repetition", start: a.start, end: a.end, note: `Agent repeated itself: “${a.text.slice(0, 60)}”` });
    }
    seen.push(w);
  }

  // Tool calls.
  let toolCalls = 0, toolFailures = 0;
  for (const ev of call.transcript_with_tool_calls || []) {
    if (ev.role === "tool_call_invocation") toolCalls++;
    if (ev.role === "tool_call_result") {
      const content = String(ev.content ?? "");
      if (ev.successful === false || /\b(error|failed|exception|timed? ?out)\b/i.test(content)) toolFailures++;
    }
  }

  // Falls back to plain transcript content when words are missing.
  const userSpoke = userReal.length > 0 ||
    (call.transcript_object || []).some((u) => u.role === "user" && (u.content || "").trim().length > 1);

  const metrics: TimingMetrics = {
    turns: segs.length,
    agent_turns: agent.length,
    user_turns: user.length,
    agent_talk_s: round(agentTalk),
    user_talk_s: round(userTalk),
    talk_ratio: agentTalk + userTalk > 0 ? round(agentTalk / (agentTalk + userTalk), 3) : null,
    time_to_first_word_s: agent.length ? round(agent[0].start) : null,
    avg_response_gap_s: roundN(mean(gaps)),
    p90_response_gap_s: roundN(percentile(gaps, 90)),
    max_response_gap_s: gaps.length ? round(Math.max(...gaps)) : null,
    interruptions,
    agent_interruptions: agentInterruptions,
    overtalk_pct: span > 0 ? round(overtalk / span, 3) : null,
    dead_air_pct: deadAirPct === null ? null : round(Math.min(1, deadAirPct), 3),
    longest_silence_s: allUnion.length > 1 ? round(longestSilence) : null,
    longest_agent_monologue_s: agent.length ? round(longestMonologue) : null,
    repetition_count: repetition,
    tool_calls: toolCalls,
    tool_failures: toolFailures,
    user_spoke: userSpoke,
  };
  return { metrics, events: events.sort((a, b) => a.start - b.start), segments: segs };
}

function round(x: number, d = 2): number { const f = 10 ** d; return Math.round(x * f) / f; }
function roundN(x: number | null, d = 2): number | null { return x === null ? null : round(x, d); }
