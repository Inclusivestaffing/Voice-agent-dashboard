// Team feedback on the human-likeness analysis: 👍/👎 on each flagged moment, how the score feels,
// and anything the analysis missed. Pure functions (safe for client and server); storage is in
// feedbackStore.ts. The workspace roll-up is what "How accurate is it?" in Analytics shows, and the
// recent corrections are handed to Claude so later reviews follow this team's judgement.

import type { HumanlikeResult, Moment } from "./schema";

export type MomentVote = "up" | "down";
export type ScoreVote = "low" | "right" | "high";
export const DOWN_REASONS = ["not_an_issue", "wrong_time", "wrong_reason", "other"] as const;
export type DownReason = (typeof DOWN_REASONS)[number];
export const SCORE_VOTES: ScoreVote[] = ["low", "right", "high"];

export function downReasonLabel(r: DownReason, kind: Moment["kind"]): string {
  if (r === "not_an_issue") return kind === "natural" ? "It didn't sound natural" : kind === "mistake" ? "It wasn't a mistake" : "It sounded fine to me";
  return { wrong_time: "Wrong moment in the call", wrong_reason: "Right moment, wrong explanation", other: "Something else" }[r];
}

export interface MomentFeedback { vote: MomentVote; reason?: DownReason; at: string }
export interface CallFeedback {
  moments: Record<string, MomentFeedback>;
  score?: { vote: ScoreVote; at: string };
  missed?: { text: string; at: string };
}
export const emptyCallFeedback = (): CallFeedback => ({ moments: {} });

/** A past judgement the team confirmed or rejected (fed back to Claude as calibration). */
export interface FeedbackExample {
  call_id: string; key: string; kind: Moment["kind"]; category: string; what: string;
  vote: MomentVote; reason?: DownReason; at: string;
}
type Tally = { up: number; down: number };
export interface WorkspaceFeedback {
  v: 1;
  kinds: Record<Moment["kind"], Tally>;
  categories: Record<string, Tally>;
  /** Votes on moments the listening AI heard in the audio (tracked separately: is the listener right?). */
  heard?: Tally;
  score: Record<ScoreVote, number>;
  missed: { call_id: string; text: string; at: string }[];
  recent: FeedbackExample[];
}
export const emptyWorkspaceFeedback = (): WorkspaceFeedback => ({
  v: 1, kinds: { mistake: { up: 0, down: 0 }, robotic: { up: 0, down: 0 }, natural: { up: 0, down: 0 } },
  categories: {}, score: { low: 0, right: 0, high: 0 }, missed: [], recent: [],
});

/** Stable id for a moment within its call (results are stored, so this doesn't change on reload). */
export const momentKey = (m: Pick<Moment, "at_s" | "kind" | "category">) => `${Math.round(m.at_s * 10)}-${m.kind}-${m.category}`;

export type FeedbackInput =
  | { type: "moment"; key: string; vote: MomentVote | null; reason?: DownReason | null }
  | { type: "score"; vote: ScoreVote | null }
  | { type: "missed"; text: string };

const RECENT_CAP = 40, MISSED_CAP = 30;
const bump = (t: Tally | undefined, vote: MomentVote | undefined, by: number): Tally => {
  const n = { ...(t ?? { up: 0, down: 0 }) };
  if (vote) n[vote] = Math.max(0, n[vote] + by);
  return n;
};

/**
 * Applies one change to a call's feedback and the workspace roll-up. Returns new objects (inputs are
 * not mutated). Unknown moment keys are rejected by returning null.
 */
export function applyFeedback(
  result: HumanlikeResult, call: CallFeedback, ws: WorkspaceFeedback, input: FeedbackInput, now = new Date().toISOString(),
): { call: CallFeedback; ws: WorkspaceFeedback } | null {
  const c: CallFeedback = { ...call, moments: { ...call.moments } };
  const w: WorkspaceFeedback = { ...ws, kinds: { ...ws.kinds }, categories: { ...ws.categories }, score: { ...ws.score }, missed: [...ws.missed], recent: [...ws.recent] };

  if (input.type === "moment") {
    const m = result.moments.find((x) => momentKey(x) === input.key);
    if (!m) return null;
    const prev = c.moments[input.key]?.vote;
    w.kinds[m.kind] = bump(bump(w.kinds[m.kind], prev, -1), input.vote ?? undefined, +1);
    w.categories[m.category] = bump(bump(w.categories[m.category], prev, -1), input.vote ?? undefined, +1);
    if (m.heard) w.heard = bump(bump(w.heard, prev, -1), input.vote ?? undefined, +1);
    w.recent = w.recent.filter((e) => !(e.call_id === result.call_id && e.key === input.key));
    if (input.vote) {
      const reason = input.vote === "down" ? input.reason ?? undefined : undefined;
      c.moments[input.key] = { vote: input.vote, ...(reason ? { reason } : {}), at: now };
      w.recent.unshift({ call_id: result.call_id, key: input.key, kind: m.kind, category: m.category, what: m.what.slice(0, 200), vote: input.vote, ...(reason ? { reason } : {}), at: now });
      w.recent = w.recent.slice(0, RECENT_CAP);
    } else {
      delete c.moments[input.key];
    }
  } else if (input.type === "score") {
    const prev = c.score?.vote;
    if (prev) w.score[prev] = Math.max(0, w.score[prev] - 1);
    if (input.vote) { w.score[input.vote] += 1; c.score = { vote: input.vote, at: now }; } else delete c.score;
  } else {
    const text = input.text.trim().slice(0, 500);
    w.missed = w.missed.filter((x) => x.call_id !== result.call_id);
    if (text) { c.missed = { text, at: now }; w.missed.unshift({ call_id: result.call_id, text, at: now }); w.missed = w.missed.slice(0, MISSED_CAP); } else delete c.missed;
  }
  return { call: c, ws: w };
}

/** 95% Wilson interval for a proportion (honest range for small samples). */
export function wilson(successes: number, n: number): [number, number] | null {
  if (n <= 0) return null;
  const z = 1.96, p = successes / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export interface AccuracySummary {
  reviewed: number; agreed: number; rate: number | null; range: [number, number] | null;
  kinds: { kind: Moment["kind"]; reviewed: number; rate: number | null }[];
  worstCategories: { category: string; reviewed: number; rate: number }[];
  /** Moments found by the listening AI: how often the team agreed. */
  heard: { reviewed: number; rate: number | null };
  score: Record<ScoreVote, number>; scoreVotes: number;
  missed: WorkspaceFeedback["missed"];
  enough: boolean;
}
/** Minimum reviewed moments before an accuracy figure is shown as meaningful. */
export const MIN_REVIEWED = 20;

export function accuracySummary(ws: WorkspaceFeedback | null): AccuracySummary {
  const w = ws ?? emptyWorkspaceFeedback();
  const kinds = (["mistake", "robotic", "natural"] as const).map((kind) => {
    const t = w.kinds[kind]; const n = t.up + t.down;
    return { kind, reviewed: n, rate: n ? t.up / n : null };
  });
  const reviewed = kinds.reduce((a, k) => a + k.reviewed, 0);
  const agreed = (["mistake", "robotic", "natural"] as const).reduce((a, k) => a + w.kinds[k].up, 0);
  const worstCategories = Object.entries(w.categories)
    .map(([category, t]) => ({ category, reviewed: t.up + t.down, rate: t.up + t.down ? t.up / (t.up + t.down) : 1 }))
    .filter((c) => c.reviewed >= 3 && c.rate < 0.7).sort((a, b) => a.rate - b.rate).slice(0, 3);
  const scoreVotes = w.score.low + w.score.right + w.score.high;
  const h = w.heard ?? { up: 0, down: 0 }, hn = h.up + h.down;
  return {
    reviewed, agreed, rate: reviewed ? agreed / reviewed : null, range: wilson(agreed, reviewed), kinds, worstCategories,
    heard: { reviewed: hn, rate: hn ? h.up / hn : null },
    score: w.score, scoreVotes, missed: w.missed.slice(0, 5), enough: reviewed >= MIN_REVIEWED,
  };
}

/** Calibration notes for Claude: the team's most recent corrections and confirmations. */
export function calibrationNotes(ws: WorkspaceFeedback | null, max = 12): string | null {
  if (!ws || !ws.recent.length) return null;
  const downs = ws.recent.filter((e) => e.vote === "down").slice(0, Math.ceil(max * 0.7));
  const ups = ws.recent.filter((e) => e.vote === "up").slice(0, max - downs.length);
  if (!downs.length && !ups.length) return null;
  const line = (e: FeedbackExample) => `- [${e.kind} / ${e.category}] "${e.what}"${e.reason ? ` (reviewer: ${downReasonLabel(e.reason, e.kind)})` : ""}`;
  const parts = [
    "This business's reviewers have checked earlier findings on their calls. Calibrate to their judgement: avoid flagging things like the rejected examples, keep flagging things like the confirmed ones. Never copy these into this call's findings.",
  ];
  if (downs.length) parts.push("Rejected by the reviewers (the finding was wrong):", ...downs.map(line));
  if (ups.length) parts.push("Confirmed by the reviewers (the finding was right):", ...ups.map(line));
  const s = ws.score, n = s.low + s.right + s.high;
  if (n >= 5) parts.push(`Overall-score feedback so far: ${s.low} said too low, ${s.right} about right, ${s.high} too high.`);
  return parts.join("\n");
}
