// Sample human-likeness results for the Open Water Marine demo calls. The demo has no recordings,
// so the voice numbers are simulated (deterministically, per call); everything is labelled "sample".

import { demoCalls, type DemoCall } from "../demo/openWater";
import { demoRawCall } from "../demo/callRaw";
import type { CallDiagnosis } from "../ai/schemas";
import { THRESHOLDS, timedTurns, type AcousticSummary, type SentenceFeatures, type TimedTurn } from "./acoustics";
import { acousticOnlyResult, validateMoments } from "./analyze";
import { HL_VERSION, overallHumanScore, scoreLabel, type HumanlikeResult, type HumanlikeStored, type ListeningIssue, type ListeningResult, type Moment } from "./schema";

/** Small deterministic pseudo-random generator so the sample looks the same on every load. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 48271) % 2147483647) / 2147483647);
}

function simulatedAcoustics(c: DemoCall, turns: TimedTurn[]): AcousticSummary {
  const id = Number(c.call_id.replace(/\D/g, "")) || 1;
  const r = rng(id * 7919);
  const base = 1.15 + (id % 7) * 0.22; // some calls flatter, some livelier
  const sentences: SentenceFeatures[] = turns.filter((t) => t.role === "agent" && t.end - t.start >= 0.6).map((t) => {
    const readback = /\d/.test(t.text);
    const words = t.text.split(/\s+/).filter(Boolean).length;
    const spread = readback ? 0.6 + r() * 0.4 : Math.max(0.5, base + (r() - 0.5) * 0.9);
    // The demo's word timings are synthetic, so the speaking rate is simulated too (realistic phone pace,
    // a little faster on some calls); number readbacks are rushed, as text-to-speech tends to do.
    const rate = readback ? 3.7 + r() * 0.4 : 2.4 + r() * 0.9 + (id % 5 === 0 ? 0.5 : 0);
    return {
      turn: t.turn, start: t.start, end: t.end, words, rate_wps: Math.round(rate * 100) / 100,
      pitch_median_hz: Math.round(168 + r() * 20), pitch_spread_st: Math.round(spread * 100) / 100,
      voiced_ratio: 0.7, loudness_range_db: Math.round((14 + r() * 8) * 10) / 10, pauses: r() > 0.85 ? 1 : 0, abrupt_end: false,
      text: t.text.slice(0, 160),
    };
  });
  const spreads = sentences.map((s) => s.pitch_spread_st as number);
  const rates = sentences.map((s) => s.rate_wps);
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? null;
  const cv = (xs: number[]) => { if (xs.length < 3) return null; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.round((Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m) * 100) / 100; };
  return {
    analyzed: sentences.length > 0, source: "multi_channel", sentences,
    pitch_spread_median_st: med(spreads), rate_median_wps: med(rates), rate_cv: cv(rates), pitch_cv: cv(spreads),
    monotone_share: spreads.length ? Math.round((spreads.filter((v) => v < THRESHOLDS.flatPitchSt).length / spreads.length) * 100) / 100 : null,
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Simulated listening check (what Gemini would report), deterministic per call. */
function simulatedListening(c: DemoCall, turns: TimedTurn[]): ListeningResult {
  const id = Number(c.call_id.replace(/\D/g, "")) || 1;
  const r = rng(id * 104729);
  const agent = turns.filter((t) => t.role === "agent");
  if (c.call_id === "owm-9") {
    const t = agent.find((x) => x.turn === 8);
    return {
      model: "sample", mos: 3.4,
      reason: "Warm and clear in the greeting and when using the caller's name, but the phone-number readback came out one digit at a time on the same falling note, which sounds machine-generated.",
      issues: t ? [{ turn: 8, at_s: r1(t.start), end_s: r1(t.end), problem: "flat_robotic_tone", severity: "major", confidence: "high", heard: "Read \"2 1 4 0 4 5\" one digit at a time on the same falling note, with no grouping." }] : [],
    };
  }
  const mos = r1(2.7 + (id % 7) * 0.2 + r() * 0.3);
  const issues: ListeningIssue[] = [];
  const readback = agent.find((t) => /\d/.test(t.text));
  if (readback) issues.push({ turn: readback.turn, at_s: r1(readback.start), end_s: r1(readback.end), problem: "unnatural_pace", severity: "minor", confidence: "medium", heard: `Rushed through the numbers in "${readback.text.slice(0, 60)}" without pausing between groups.` });
  if (id % 6 === 1 && agent[1]) issues.push({ turn: agent[1].turn, at_s: r1(agent[1].start), end_s: r1(agent[1].end), problem: "glitch_or_distortion", severity: "minor", confidence: "medium", heard: `A short metallic warble on "${agent[1].text.split(/\s+/).slice(0, 6).join(" ")}…".` });
  const reason = mos >= 3.8 ? "Warm, relaxed delivery with natural rises and falls; only small tells on the longer sentences."
    : mos >= 3.2 ? "Pleasant and clear, but the melody repeats from sentence to sentence, which gives away that it's synthetic."
    : "Clear words, but a flat, even delivery that sounds read out rather than spoken.";
  return { model: "sample", mos, reason, issues: issues.sort((a, b) => a.at_s - b.at_s) };
}

/** Hand-written review of call #9 (the phone-number readback loop and the weekend drop-off gap). */
const CALL9_MOMENTS: Moment[] = [
  { at_s: 13.8, end_s: 17.0, turn: 4, kind: "natural", category: "natural_acknowledgement", what: "Used the caller's name straight away: \"Thanks, Sean.\"", why: "A quick, warm acknowledgement before the next question is what a person on the phone does.", fix: "" },
  { at_s: 23.9, end_s: 28.0, turn: 6, kind: "robotic", category: "slow_response", what: "Paused for about 2.5 seconds before answering.", why: "The caller finished at 21.4s and the agent started at 23.9s; on a phone line that gap feels like nobody is there.", fix: "Raise responsiveness in Retell and keep the next step short so the reply starts sooner." },
  { at_s: 31.9, end_s: 35.6, turn: 8, kind: "robotic", category: "robotic_readback", heard: true, what: "Read the phone number back digit by digit in a flat voice: \"2 1 4 0 4 5\".", why: "Digits read one by one with no grouping or change in pitch sound machine-generated; the listening AI heard the same flat note on every digit.", fix: "Add to the prompt: \"Read phone numbers back in groups (area code, three digits, four digits), e.g. 'two-one-four, oh-four, two-five'.\"" },
  { at_s: 38.0, end_s: 41.8, turn: 10, kind: "mistake", category: "misheard_caller", what: "Got the number wrong again after the caller corrected it (\"2 5 at the end\").", why: "The agent appended the correction instead of replacing the last digits, so the caller had to correct it a second time.", fix: "Add to the prompt: \"When the caller corrects a number, repeat the full corrected number once and ask them to confirm.\"" },
  { at_s: 44.8, end_s: 48.4, turn: 12, kind: "robotic", category: "repetition", what: "Asked \"is that correct?\" with the same sentence for the third time.", why: "Repeating an identical sentence is the clearest sign of a script; a person would rephrase.", fix: "Add to the prompt: \"Never repeat the same sentence; if you need to confirm again, rephrase it.\"" },
  { at_s: 69.2, end_s: 76.8, turn: 18, kind: "mistake", category: "ignored_caller", what: "Restated the weekday-only policy although the caller had just said they can only come on weekends.", why: "The caller's constraint was clear; repeating the policy instead of offering an alternative feels like not listening.", fix: "Give the agent a fallback for weekend-only customers (e.g. after-hours key drop-box) and say: \"If the caller can't come on weekdays, offer the weekend option instead of repeating the hours.\"" },
  { at_s: 80.9, end_s: 86.6, turn: 20, kind: "natural", category: "good_empathy", what: "Offered to have the team call back to work something out.", why: "A flexible, caring close after a dead end sounds like a real receptionist.", fix: "" },
];

function sampleFor(c: DemoCall): HumanlikeStored {
  const raw = demoRawCall(c);
  const turns = timedTurns(raw.transcript_object);
  const durationS = (c.duration_ms ?? 0) / 1000;
  if (durationS < 10 || turns.filter((t) => t.role === "agent").length < 2) {
    return { version: HL_VERSION, call_id: c.call_id, skipped: true, reason: durationS < 10 ? "Call too short to judge." : "Not enough agent speech in the transcript.", analyzed_at: new Date().toISOString() };
  }
  const base = acousticOnlyResult(raw, turns, simulatedAcoustics(c, turns), durationS, simulatedListening(c, turns));
  const d = c.analysis as unknown as CallDiagnosis | null;
  const sc = d?.scorecard;
  const listening = sc ? Math.round(((sc.intent_understanding + sc.tone_and_empathy) / 2 - 1) * 25) : 70;
  const accuracy = sc ? Math.round((sc.information_accuracy - 1) * 25) : 75;
  const flow = sc ? Math.round(((base.subscores.flow ?? 80) + (sc.flow_efficiency - 1) * 25) / 2) : base.subscores.flow;
  const subscores = { ...base.subscores, flow, listening, accuracy };
  const score = overallHumanScore(subscores);
  const extra: Moment[] = [];
  for (const f of d?.what_failed ?? []) {
    const t = turns.filter((x) => x.role === "agent").at(-1);
    if (t && f.point) extra.push({ at_s: t.start, end_s: t.end, turn: t.turn, kind: "mistake", category: "other", what: f.point, why: "From the AI call review.", fix: d?.recommended_fix && d.recommended_fix !== "None needed" ? d.recommended_fix : "" });
  }
  const moments = c.call_id === "owm-9" ? CALL9_MOMENTS : validateMoments([...base.moments, ...extra], turns, durationS);
  const result: HumanlikeResult = {
    ...base, source: "sample", score, label: scoreLabel(score), subscores,
    verdict: `${scoreLabel(score)}: sample review (the demo has no real recordings).`,
    summary: c.call_id === "owm-9"
      ? "Friendly and quick to use the caller's name, but the phone-number readback sounded mechanical and looped three times, and the agent repeated the weekday policy instead of offering the weekend-only caller an alternative."
      : `Sample review. ${moments.filter((m) => m.kind === "robotic").length} robotic moment(s), ${moments.filter((m) => m.kind === "mistake").length} mistake(s) and ${moments.filter((m) => m.kind === "natural").length} natural moment(s).`,
    moments,
    top_fixes: c.call_id === "owm-9"
      ? ["Read phone numbers back in groups and confirm a correction once.", "Never repeat the same sentence; rephrase instead.", "Offer a weekend fallback instead of repeating the hours."]
      : base.top_fixes,
  };
  return result;
}

let cache: Map<string, HumanlikeStored> | null = null;
export function sampleHumanlike(): Map<string, HumanlikeStored> {
  if (!cache) cache = new Map(demoCalls().map((c) => [c.call_id, sampleFor(c)]));
  return cache;
}
