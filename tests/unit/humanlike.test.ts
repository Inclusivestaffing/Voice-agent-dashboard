import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { analyzeAgentVoice, pitchSpreadSt, pitchTrack, SAMPLE_RATE, timedTurns, yinPitch } from "../../lib/humanlike/acoustics";
import { overallHumanScore, scoreLabel } from "../../lib/humanlike/schema";

const tone = (hz: (t: number) => number, seconds: number, amp = 0.3) => {
  const n = Math.round(seconds * SAMPLE_RATE), x = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) { phase += (2 * Math.PI * hz(i / SAMPLE_RATE)) / SAMPLE_RATE; x[i] = amp * Math.sin(phase); }
  return x;
};

describe("pitch tracking (YIN)", () => {
  it("reads a 200 Hz tone as ~200 Hz", () => {
    const f = yinPitch(tone(() => 200, 0.04));
    expect(f).not.toBeNull();
    expect(Math.abs((f as number) - 200)).toBeLessThan(3);
  });
  it("reads a 120 Hz voice-range tone", () => {
    const track = pitchTrack(tone(() => 120, 1));
    expect(track.length).toBeGreaterThan(30);
    const med = [...track].sort((a, b) => a - b)[Math.floor(track.length / 2)];
    expect(Math.abs(med - 120)).toBeLessThan(3);
  });
  it("treats silence as unvoiced", () => {
    expect(pitchTrack(new Float32Array(SAMPLE_RATE))).toHaveLength(0);
  });
  it("finds ~0 spread on a flat tone and a large spread on a glide", () => {
    const flat = pitchSpreadSt(pitchTrack(tone(() => 180, 1.5)));
    const glide = pitchSpreadSt(pitchTrack(tone((t) => 140 + 80 * t, 1.5))); // 140 → 260 Hz
    expect(flat).not.toBeNull();
    expect(flat as number).toBeLessThan(0.3);
    expect(glide as number).toBeGreaterThan(3);
  });
});

describe("agent voice features", () => {
  it("measures the agent channel of a two-channel recording", () => {
    const seconds = 4, n = seconds * SAMPLE_RATE;
    const agent = tone((t) => 150 + 60 * Math.sin(t * 3), seconds); // lively agent on the left
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { pcm[i * 2] = Math.round(agent[i] * 32767 * (i / SAMPLE_RATE < 3 ? 1 : 0)); pcm[i * 2 + 1] = 0; }
    const transcript = [
      { role: "agent" as const, content: "Thanks for calling, how can I help you today?", words: [{ word: "Thanks", start: 0.1, end: 0.4 }, { word: "today?", start: 2.4, end: 2.9 }] },
    ];
    const r = analyzeAgentVoice(pcm, timedTurns(transcript));
    expect(r.analyzed).toBe(true);
    expect(r.source).toBe("multi_channel");
    expect(r.sentences[0].turn).toBe(0);
    expect(r.sentences[0].pitch_spread_st as number).toBeGreaterThan(1.5);
  });
  it("reports no recording cleanly", () => {
    const r = analyzeAgentVoice(null, []);
    expect(r.analyzed).toBe(false);
    expect(r.note).toMatch(/recording/i);
  });
});

describe("scores", () => {
  it("weights only the sub-scores that exist", () => {
    expect(overallHumanScore({ voice: 80, timing: 60, flow: null, listening: null, accuracy: null })).toBe(Math.round((80 * 0.25 + 60 * 0.2) / 0.45));
    expect(scoreLabel(90)).toBe("Sounds human");
    expect(scoreLabel(40)).toBe("Sounds robotic");
  });
});

describe("moment validation", async () => {
  const { validateMoments } = await import("../../lib/humanlike/analyze");
  const turns = [
    { turn: 0, role: "agent" as const, text: "Hi", start: 0.5, end: 3, backchannel: false },
    { turn: 1, role: "user" as const, text: "Hello", start: 3.5, end: 5, backchannel: false },
    { turn: 2, role: "agent" as const, text: "Sure", start: 20, end: 24, backchannel: false },
  ];
  const m = (at_s: number, turn: number) => ({ at_s, end_s: at_s + 1, turn, kind: "robotic" as const, category: "monotone_voice" as const, what: "w", why: "y", fix: "f" });
  it("drops moments past the end of the call or naming turns that don't exist", () => {
    const out = validateMoments([m(500, -1), m(2, 9), m(1, 0)], turns, 30);
    expect(out).toHaveLength(1);
    expect(out[0].turn).toBe(0);
  });
  it("snaps a moment to the turn it names when its time is far off", () => {
    const out = validateMoments([m(2, 2)], turns, 30);
    expect(out[0].at_s).toBe(20);
  });
  it("clears the fix on natural moments", () => {
    const out = validateMoments([{ ...m(1, 0), kind: "natural" as const, category: "natural_flow" as const }], turns, 30);
    expect(out[0].fix).toBe("");
  });
});
