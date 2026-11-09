// Audio-layer analysis of the multi-channel recording (one channel per party).
// This is how the system "listens": it decodes the real audio with ffmpeg and runs an
// energy-based voice activity detector on each channel independently. That catches
// things the transcript can't: a caller who spoke but was never transcribed, a caller
// channel that is completely silent (line/greeting problem), clipping, low volume
// and background noise.

import { spawn } from "node:child_process";
import type { Segment } from "./timing";

export interface AudioMetrics {
  user_speech_s: number;
  agent_speech_s: number;
  user_peak_db: number;
  user_noise_db: number;
  clipping_pct: number;
  /** Speech intervals (seconds) per party, for the waveform lanes. */
  user_activity: [number, number][];
  agent_activity: [number, number][];
  channel_map: "L=user,R=agent" | "L=agent,R=user";
}

const SAMPLE_RATE = 8000;
const FRAME = 160; // 20ms at 8kHz

async function ffmpegPath(): Promise<string> {
  const mod = (await import("ffmpeg-static")) as unknown as { default?: string } | string;
  const p = typeof mod === "string" ? mod : mod.default;
  if (!p) throw new Error("ffmpeg binary not available");
  return p;
}

/** Decode any audio URL to interleaved stereo 16-bit PCM at 8kHz. */
export async function decodeStereo(url: string): Promise<Int16Array> {
  if (!/^https:\/\//i.test(url)) throw new Error("Recording URL must be https");
  const bin = await ffmpegPath();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ["-hide_banner", "-loglevel", "error", "-protocol_whitelist", "https,tls,tcp", "-t", "1800", "-i", url, "-ac", "2", "-ar", String(SAMPLE_RATE), "-f", "s16le", "pipe:1"]);
    const chunks: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => (err += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${err.slice(0, 300)}`));
      const buf = Buffer.concat(chunks);
      resolve(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2)));
    });
  });
}

function frameDb(pcm: Int16Array, channel: 0 | 1): { db: number[]; clipped: number; total: number } {
  const n = Math.floor(pcm.length / 2);
  const db: number[] = [];
  let clipped = 0;
  for (let f = 0; f + FRAME <= n; f += FRAME) {
    let acc = 0;
    for (let i = f; i < f + FRAME; i++) {
      const s = pcm[i * 2 + channel];
      if (s >= 32700 || s <= -32700) clipped++;
      acc += s * s;
    }
    const rms = Math.sqrt(acc / FRAME) / 32768;
    db.push(rms > 0 ? 20 * Math.log10(rms) : -100);
  }
  return { db, clipped, total: n };
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return -100;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Energy VAD with hangover smoothing; returns speech intervals in seconds. */
export function vad(db: number[]): { intervals: [number, number][]; noise: number; peak: number } {
  const sorted = [...db].sort((a, b) => a - b);
  const noise = pct(sorted, 15);
  const peak = pct(sorted, 99);
  const threshold = Math.max(noise + 10, -50);
  const frameS = FRAME / SAMPLE_RATE;
  const intervals: [number, number][] = [];
  let start = -1, hang = 0;
  for (let i = 0; i < db.length; i++) {
    if (db[i] > threshold) {
      if (start < 0) start = i;
      hang = 12; // 240ms hangover
    } else if (start >= 0) {
      if (--hang <= 0) {
        if ((i - start) * frameS >= 0.15) intervals.push([start * frameS, i * frameS]);
        start = -1;
      }
    }
  }
  if (start >= 0) intervals.push([start * frameS, db.length * frameS]);
  return { intervals, noise, peak };
}

function overlap(a: [number, number][], b: [number, number][]) {
  let t = 0;
  for (const x of a) for (const y of b) t += Math.max(0, Math.min(x[1], y[1]) - Math.max(x[0], y[0]));
  return t;
}

export function analyzePcm(pcm: Int16Array, segments: Segment[]): AudioMetrics {
  const L = frameDb(pcm, 0), R = frameDb(pcm, 1);
  const vL = vad(L.db), vR = vad(R.db);
  // Work out which channel is the agent by matching against transcript timing.
  const agentSegs = segments.filter((s) => s.role === "agent").map((s) => [s.start, s.end] as [number, number]);
  const lIsAgent = agentSegs.length ? overlap(vL.intervals, agentSegs) >= overlap(vR.intervals, agentSegs) : false;
  const user = lIsAgent ? { v: vR, f: R } : { v: vL, f: L };
  const agent = lIsAgent ? { v: vL, f: L } : { v: vR, f: R };
  const len = (iv: [number, number][]) => iv.reduce((a, [s, e]) => a + (e - s), 0);
  return {
    user_speech_s: round(len(user.v.intervals)),
    agent_speech_s: round(len(agent.v.intervals)),
    user_peak_db: round(user.v.peak, 1),
    user_noise_db: round(user.v.noise, 1),
    clipping_pct: round(user.f.total ? (user.f.clipped / user.f.total) * 100 : 0, 3),
    user_activity: user.v.intervals.map(([a, b]) => [round(a), round(b)]),
    agent_activity: agent.v.intervals.map(([a, b]) => [round(a), round(b)]),
    channel_map: lIsAgent ? "L=agent,R=user" : "L=user,R=agent",
  };
}

export async function analyzeRecording(url: string, segments: Segment[]): Promise<AudioMetrics> {
  const pcm = await decodeStereo(url);
  return analyzePcm(pcm, segments);
}

function round(x: number, d = 2) { const f = 10 ** d; return Math.round(x * f) / f; }
