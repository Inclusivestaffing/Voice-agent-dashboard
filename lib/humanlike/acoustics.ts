// Acoustic layer of the human-likeness analysis: measures how the AGENT's voice actually sounds,
// sentence by sentence, from the call recording. Claude can't take audio, so these numbers are what
// it reads alongside the transcript. Pure functions on 8 kHz PCM; decoding is done by
// decodeStereo() in lib/metrics/audio.ts.

import type { RetellUtterance } from "../types";
import { isBackchannel } from "../metrics/timing";
import { vad } from "../metrics/audio";

/** One transcript turn with its timing; `turn` is its index in transcript_object. */
export interface TimedTurn { turn: number; role: "agent" | "user"; text: string; start: number; end: number; backchannel: boolean }

export function timedTurns(transcript: RetellUtterance[] | undefined): TimedTurn[] {
  const out: TimedTurn[] = [];
  (transcript ?? []).forEach((u, turn) => {
    if (u.role !== "agent" && u.role !== "user") return;
    const words = (u.words || []).filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
    const text = (u.content || "").trim();
    if (!words.length || !text) return;
    const start = Math.min(...words.map((w) => w.start)), end = Math.max(...words.map((w) => w.end));
    out.push({ turn, role: u.role, text, start, end, backchannel: u.role === "user" && isBackchannel(u, end - start) });
  });
  return out;
}

export const SAMPLE_RATE = 8000;
const FRAME_20MS = 160;

/** Starting thresholds. Tune these once real calls have been rated by a person. */
export const THRESHOLDS = {
  flatPitchSt: 1.2,        // pitch spread (semitones, p10–p90 / 2.56) below this sounds monotone
  livelyPitchSt: 2.2,      // above this sounds expressive
  fastRateWps: 3.6,        // words per second: rushed
  slowRateWps: 1.6,        // words per second: dragging
  uniformRateCv: 0.08,     // sentence-to-sentence speaking-rate variation below this = metronome-like
  uniformPitchCv: 0.12,    // sentence-to-sentence pitch-spread variation below this = same contour every time
  slowResponseS: 2.0,      // agent taking longer than this to answer
  instantResponseS: 0.15,  // answering faster than a person could
  longMonologueS: 18,      // one agent turn longer than this
  abruptEndDb: 9,          // last 60 ms still this close to the sentence's loud level = cut off mid-sound
};

export interface SentenceFeatures {
  turn: number;            // index in the transcript (agent and caller turns counted together)
  start: number;
  end: number;
  words: number;
  rate_wps: number;
  pitch_median_hz: number | null;
  pitch_spread_st: number | null;   // how much the pitch moves within the sentence
  voiced_ratio: number | null;
  loudness_range_db: number | null;
  pauses: number;                   // internal pauses ≥ 250 ms
  abrupt_end: boolean;
  text: string;
}

export interface AcousticSummary {
  analyzed: boolean;
  source: "multi_channel" | "mono_sliced" | "none";
  sentences: SentenceFeatures[];
  pitch_spread_median_st: number | null;
  rate_median_wps: number | null;
  rate_cv: number | null;           // variation of speaking rate between sentences
  pitch_cv: number | null;          // variation of pitch spread between sentences
  monotone_share: number | null;    // share of sentences under the flat threshold
  note?: string;
}

/* ───────────── Signal helpers ───────────── */

function channel(pcm: Int16Array, ch: 0 | 1): Float32Array {
  const n = Math.floor(pcm.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm[i * 2 + ch] / 32768;
  return out;
}

function frameDb(x: Float32Array, frame = FRAME_20MS): number[] {
  const db: number[] = [];
  for (let f = 0; f + frame <= x.length; f += frame) {
    let acc = 0;
    for (let i = f; i < f + frame; i++) acc += x[i] * x[i];
    const rms = Math.sqrt(acc / frame);
    db.push(rms > 0 ? 20 * Math.log10(rms) : -100);
  }
  return db;
}

const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] : NaN);
const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);
function cv(xs: number[]) {
  if (xs.length < 3) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!m) return null;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  return sd / m;
}

/**
 * YIN pitch estimate for one frame (de Cheveigné & Kawahara, 2002). Returns Hz, or null when the
 * frame isn't clearly voiced. Range 60–400 Hz covers adult speaking voices.
 */
export function yinPitch(frame: Float32Array, sampleRate = SAMPLE_RATE, threshold = 0.15): number | null {
  const tauMin = Math.floor(sampleRate / 400), tauMax = Math.min(Math.floor(sampleRate / 60), Math.floor(frame.length / 2));
  const w = frame.length - tauMax;
  if (w <= 0) return null;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) { const diff = frame[i] - frame[i + tau]; s += diff * diff; }
    d[tau] = s;
  }
  // Cumulative mean normalised difference.
  let running = 0;
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) { running += d[tau]; cmnd[tau] = running ? (d[tau] * tau) / running : 1; }
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      // Parabolic interpolation around the dip for sub-sample accuracy.
      const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau];
      const den = a + c - 2 * b;
      const shift = den ? (a - c) / (2 * den) : 0;
      return sampleRate / (tau + shift);
    }
  }
  return null;
}

/** Pitch track for a span of samples: one estimate every 20 ms over 40 ms windows, voiced frames only. */
export function pitchTrack(x: Float32Array, sampleRate = SAMPLE_RATE): number[] {
  const win = Math.round(sampleRate * 0.04), hop = Math.round(sampleRate * 0.02);
  const out: number[] = [];
  for (let s = 0; s + win <= x.length; s += hop) {
    const f = x.subarray(s, s + win);
    let e = 0;
    for (let i = 0; i < f.length; i++) e += f[i] * f[i];
    if (Math.sqrt(e / f.length) < 0.01) continue; // too quiet to be voiced speech
    const hz = yinPitch(f, sampleRate);
    if (hz && hz >= 60 && hz <= 400) out.push(hz);
  }
  return out;
}

/** Pitch spread in semitones: (p90 − p10) of the track, expressed against its median, divided by 2.56 ≈ a robust SD. */
export function pitchSpreadSt(track: number[]): number | null {
  if (track.length < 6) return null;
  const s = [...track].sort((a, b) => a - b);
  const med = quantile(s, 0.5), lo = quantile(s, 0.1), hi = quantile(s, 0.9);
  const st = (f: number) => 12 * Math.log2(f / med);
  return (st(hi) - st(lo)) / 2.56;
}

/* ───────────── Main entry ───────────── */

/**
 * Per-sentence voice features for the agent. Uses the agent's own channel of a two-channel
 * recording when possible; otherwise slices the agent's sentences out of the mixed recording using
 * the transcript's word timings (overlapping caller speech is skipped in that case).
 */
export function analyzeAgentVoice(pcm: Int16Array | null, turns: TimedTurn[]): AcousticSummary {
  const agentSegs = turns.filter((s) => s.role === "agent" && s.end - s.start >= 0.6);
  const userSegs = turns.filter((s) => s.role === "user");
  if (!pcm || pcm.length < SAMPLE_RATE || !agentSegs.length) {
    return { analyzed: false, source: "none", sentences: [], pitch_spread_median_st: null, rate_median_wps: null, rate_cv: null, pitch_cv: null, monotone_share: null, note: pcm ? "No agent speech long enough to measure." : "No recording available." };
  }
  const L = channel(pcm, 0), R = channel(pcm, 1);
  // Mono recordings arrive as two identical channels.
  let diff = 0, energy = 0;
  for (let i = 0; i < L.length; i += 50) { diff += Math.abs(L[i] - R[i]); energy += Math.abs(L[i]); }
  const mono = energy === 0 || diff / energy < 0.05;
  let agent: Float32Array;
  if (mono) agent = L;
  else {
    // The agent channel is the one whose speech lines up with the agent's transcript timing.
    const overlapWith = (iv: [number, number][]) => iv.reduce((t, [a, b]) => t + agentSegs.reduce((u, s) => u + Math.max(0, Math.min(b, s.end) - Math.max(a, s.start)), 0), 0);
    const vL = vad(frameDb(L)).intervals, vR = vad(frameDb(R)).intervals;
    agent = overlapWith(vL) >= overlapWith(vR) ? L : R;
  }

  const sentences: SentenceFeatures[] = [];
  for (const s of agentSegs) {
    if (mono && userSegs.some((u) => u.start < s.end - 0.2 && u.end > s.start + 0.2)) continue; // mixed audio: skip overlaps
    const a = Math.max(0, Math.floor(s.start * SAMPLE_RATE)), b = Math.min(agent.length, Math.ceil(s.end * SAMPLE_RATE));
    if (b - a < SAMPLE_RATE * 0.5) continue;
    const x = agent.subarray(a, b);
    const track = pitchTrack(x);
    const db = frameDb(x).filter((v) => v > -90);
    const sortedDb = [...db].sort((p, q) => p - q);
    const loud = quantile(sortedDb, 0.9), quiet = quantile(sortedDb, 0.1);
    // Internal pauses: runs of quiet 20 ms frames lasting at least 250 ms.
    let pauses = 0, run = 0;
    for (const v of db) { if (v < loud - 25) { run++; } else { if (run >= 13) pauses++; run = 0; } }
    const tail = frameDb(x.subarray(Math.max(0, x.length - Math.round(SAMPLE_RATE * 0.06))));
    const tailDb = tail.length ? Math.max(...tail) : -100;
    const words = s.text.split(/\s+/).filter(Boolean).length;
    const dur = Math.max(0.3, s.end - s.start);
    const spread = pitchSpreadSt(track);
    sentences.push({
      turn: s.turn,
      start: round(s.start), end: round(s.end), words, rate_wps: round(words / dur),
      pitch_median_hz: track.length ? round(median(track), 0) : null,
      pitch_spread_st: spread == null ? null : round(spread),
      voiced_ratio: round(track.length / Math.max(1, Math.floor((x.length - SAMPLE_RATE * 0.04) / (SAMPLE_RATE * 0.02)))),
      loudness_range_db: Number.isFinite(loud - quiet) ? round(loud - quiet, 1) : null,
      pauses,
      abrupt_end: Number.isFinite(loud) && tailDb > loud - THRESHOLDS.abruptEndDb && s.end < (pcm.length / 2) / SAMPLE_RATE - 0.3,
      text: s.text.slice(0, 160),
    });
  }
  const spreads = sentences.map((x) => x.pitch_spread_st).filter((v): v is number => v != null);
  const rates = sentences.map((x) => x.rate_wps);
  return {
    analyzed: sentences.length > 0,
    source: mono ? "mono_sliced" : "multi_channel",
    sentences,
    pitch_spread_median_st: spreads.length ? round(median(spreads)) : null,
    rate_median_wps: rates.length ? round(median(rates)) : null,
    rate_cv: cv(rates) == null ? null : round(cv(rates)!),
    pitch_cv: cv(spreads) == null ? null : round(cv(spreads)!),
    monotone_share: spreads.length ? round(spreads.filter((v) => v < THRESHOLDS.flatPitchSt).length / spreads.length) : null,
    note: sentences.length ? undefined : "Agent sentences overlapped with the caller or were too short to measure.",
  };
}

function round(x: number, d = 2) { const f = 10 ** d; return Math.round(x * f) / f; }
