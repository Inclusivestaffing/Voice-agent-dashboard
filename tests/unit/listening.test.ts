import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SAMPLE_RATE, type AcousticSummary, type TimedTurn } from "../../lib/humanlike/acoustics";
import { agentOnlyTrack, buildListenPrompt, issueToMoment, listeningReport, mosTo100, parseListening } from "../../lib/humanlike/listening";
import { acousticOnlyResult, buildUserPrompt } from "../../lib/humanlike/analyze";
import { applyFeedback, accuracySummary, emptyCallFeedback, emptyWorkspaceFeedback, momentKey } from "../../lib/humanlike/feedback";
import { summarizeHumanlike } from "../../lib/humanlike/summary";
import { listened, type HumanlikeResult, type ListeningResult } from "../../lib/humanlike/schema";
import type { RetellCall } from "../../lib/types";

const turns: TimedTurn[] = [
  { turn: 0, role: "agent", text: "Thanks for calling, this is Clara.", start: 0.5, end: 2.5, backchannel: false },
  { turn: 1, role: "user", text: "Hi, I need warehouse work.", start: 3, end: 5, backchannel: false },
  { turn: 2, role: "agent", text: "Sure. Your number is 7 0 1 5 5 5?", start: 5.6, end: 8, backchannel: false },
];

const answer = (o: object) => JSON.stringify({ reason: "Clear but flat on the readback.", naturalness_mos: 3.6, issues: [], ...o });

describe("listening check: answer checking", () => {
  it("keeps issues on real agent turns and takes their times from the transcript", () => {
    const l = parseListening(answer({ issues: [
      { utterance_id: 2, problem: "flat_robotic_tone", severity: "major", confidence: "high", heard: "Read the digits on one note." },
      { utterance_id: 1, problem: "glitch_or_distortion", severity: "minor", confidence: "high", heard: "That's the caller." },     // caller turn
      { utterance_id: 9, problem: "odd_pause", severity: "minor", confidence: "low", heard: "Doesn't exist." },                   // no such turn
      { utterance_id: 2, problem: "flat_robotic_tone", severity: "minor", confidence: "low", heard: "Duplicate." },               // same turn + problem
    ] }), turns, "gemini-test");
    expect(listened(l)).toBe(true);
    const r = l as ListeningResult;
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ turn: 2, at_s: 5.6, end_s: 8, problem: "flat_robotic_tone" });
    expect(r.mos).toBe(3.6);
  });
  it("clamps the score, tolerates code fences and unknown labels, and reports unreadable answers", () => {
    const l = parseListening("```json\n" + answer({ naturalness_mos: 9, issues: [{ utterance_id: 0, problem: "weird", severity: "huge", confidence: "sure", heard: "Something odd." }] }) + "\n```", turns, "m") as ListeningResult;
    expect(l.mos).toBe(5);
    expect(l.issues[0]).toMatchObject({ problem: "other", severity: "minor", confidence: "low" });
    expect(parseListening("not json", turns, "m")).toHaveProperty("error");
    expect(parseListening(JSON.stringify({ reason: "x" }), turns, "m")).toHaveProperty("error");
  });
  it("maps 1–5 onto 0–100 and turns heard issues into moments", () => {
    expect([mosTo100(1), mosTo100(3), mosTo100(5)]).toEqual([0, 50, 100]);
    const m = issueToMoment({ turn: 2, at_s: 5.6, end_s: 8, problem: "mispronunciation", severity: "major", confidence: "high", heard: "Said 'Fargo' as 'Far-joe'." });
    expect(m).toMatchObject({ kind: "mistake", category: "mispronunciation", heard: true });
    expect(m.fix).toMatch(/pronunciation/);
  });
  it("lists agent utterances by ID for the listener and summarises its report for Claude", () => {
    const p = buildListenPrompt(turns);
    expect(p).toContain("T0 [0.5–2.5s]");
    expect(p).toContain("T2 [5.6–8.0s]");
    expect(p).not.toContain("warehouse"); // caller words aren't sent
    expect(listeningReport({ error: "the call is too long for the listening check" })).toMatch(/Not available/);
    expect(listeningReport(null)).toMatch(/Not run/);
  });
});

describe("listening check: agent-only audio", () => {
  const n = 9 * SAMPLE_RATE;
  const stereo = (left: (i: number) => number, right: (i: number) => number) => {
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { pcm[i * 2] = left(i); pcm[i * 2 + 1] = right(i); }
    return pcm;
  };
  const loud = (i: number) => Math.round(8000 * Math.sin((2 * Math.PI * 180 * i) / SAMPLE_RATE));
  it("silences the caller in a mono recording, with fades at the cuts", () => {
    const track = agentOnlyTrack(stereo(loud, loud), turns)!;
    expect(track.mono).toBe(true);
    const rms = (a: number, b: number) => Math.sqrt(track.pcm.slice(a * SAMPLE_RATE, b * SAMPLE_RATE).reduce((s, v) => s + v * v, 0) / ((b - a) * SAMPLE_RATE));
    expect(rms(1, 2)).toBeGreaterThan(4000);   // agent speaking
    expect(rms(3.2, 4.8)).toBe(0);             // caller's turn removed
    expect(Math.abs(track.pcm[Math.floor(0.35 * SAMPLE_RATE)])).toBe(0); // before the first turn's padding
  });
  it("keeps the agent's own channel of a two-channel recording", () => {
    const track = agentOnlyTrack(stereo((i) => (i / SAMPLE_RATE < 3 || i / SAMPLE_RATE > 5.5 ? loud(i) : 0), (i) => (i / SAMPLE_RATE >= 3 && i / SAMPLE_RATE <= 5 ? loud(i) : 0)), turns)!;
    expect(track.mono).toBe(false);
    expect(Math.abs(track.pcm[Math.floor(1.5 * SAMPLE_RATE) + 3])).toBeGreaterThan(0);
    expect(track.pcm[Math.floor(4 * SAMPLE_RATE)]).toBe(0);
  });
  it("returns nothing without audio", () => {
    expect(agentOnlyTrack(null, turns)).toBeNull();
  });
});

describe("listening check: in the result", () => {
  const raw = { call_id: "c1", duration_ms: 9000, transcript_object: [], disconnection_reason: "agent_hangup" } as unknown as RetellCall;
  const noAcoustic: AcousticSummary = { analyzed: false, source: "none", sentences: [], pitch_spread_median_st: null, rate_median_wps: null, rate_cv: null, pitch_cv: null, monotone_share: null };
  const heard: ListeningResult = { model: "gemini-test", mos: 2.2, reason: "Flat, read-out delivery.", issues: [
    { turn: 2, at_s: 5.6, end_s: 8, problem: "flat_robotic_tone", severity: "major", confidence: "high", heard: "Read the digits on one note." },
    { turn: 0, at_s: 0.5, end_s: 2.5, problem: "odd_pause", severity: "minor", confidence: "low", heard: "Maybe a pause." },
  ] };
  it("without Claude, the voice score and moments come from what was heard (low-confidence issues skipped)", () => {
    const r = acousticOnlyResult(raw, turns, { ...noAcoustic }, 9, heard);
    expect(r.subscores.voice).toBe(30);
    expect(r.moments.filter((m) => m.heard)).toHaveLength(1);
    expect(r.summary).toContain("The listening AI flagged 1 moment in the agent's voice.");
    expect(r.verdict).toContain("2.2 out of 5");
    expect(r.listening).toEqual(heard);
  });
  it("Claude's prompt carries the listening report", () => {
    const p = buildUserPrompt(raw, turns, { ...noAcoustic }, 9, "Clara", heard);
    expect(p).toContain("<listening_report>");
    expect(p).toContain("Naturalness heard: 2.2 / 5.");
    expect(p).toContain("T2 flat_robotic_tone (major, high confidence)");
  });
  it("Analytics averages naturalness, and votes on heard moments are tracked separately", () => {
    const r = acousticOnlyResult(raw, turns, { ...noAcoustic }, 9, heard) as HumanlikeResult;
    const s = summarizeHumanlike([{ call_id: "c1", start_ts: "2026-11-20T15:00:00Z" }], new Map([["c1", r]]), { timezone: "UTC", bucket: "day" });
    expect(s.listen).toEqual({ calls: 1, mos: 2.2, issuesPerCall: 2 });
    const m = r.moments.find((x) => x.heard)!;
    const out = applyFeedback(r, emptyCallFeedback(), emptyWorkspaceFeedback(), { type: "moment", key: momentKey(m), vote: "down", reason: "not_an_issue" })!;
    expect(accuracySummary(out.ws).heard).toEqual({ reviewed: 1, rate: 0 });
  });
});
