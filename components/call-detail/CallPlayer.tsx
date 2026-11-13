"use client";

// Audio + transcript + timeline, all synced to the same playhead. Clicking a transcript
// line, a timeline marker, or an evidence timestamp in the AI diagnosis seeks the audio.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import { cx } from "../ui";

interface Seg { role: "agent" | "user"; start: number; end: number; text: string; backchannel: boolean }
interface Ev { kind: string; start: number; end: number; note: string }

const SeekCtx = createContext<(t: number) => void>(() => {});
export const useSeek = () => useContext(SeekCtx);

const EVENT_STYLE: Record<string, { label: string; cls: string }> = {
  interruption: { label: "Caller interrupted", cls: "bg-[var(--s2)]" },
  agent_interruption: { label: "Agent talked over caller", cls: "bg-[var(--s5)]" },
  silence: { label: "Dead air", cls: "bg-[var(--neutral-1)]" },
  overtalk: { label: "Overtalk", cls: "bg-[var(--s8)]" },
  slow_response: { label: "Slow response", cls: "bg-[var(--status-warning)]" },
  repetition: { label: "Repeated itself", cls: "bg-[var(--s7)]" },
};

function fmt(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CallPlayer({ recordingUrl, multiChannelUrl, segments, events, durationS, agentName, children }: {
  recordingUrl: string | null; multiChannelUrl: string | null; segments: Seg[]; events: Ev[]; durationS: number;
  agentName: string; children?: React.ReactNode;
}) {
  const waveRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waveOk, setWaveOk] = useState(true);
  const [follow, setFollow] = useState(true);
  const src = recordingUrl ?? multiChannelUrl;

  useEffect(() => {
    if (!src || !waveRef.current || !audioRef.current) return;
    let destroyed = false;
    (async () => {
      const { default: WS } = await import("wavesurfer.js");
      if (destroyed) return;
      const css = getComputedStyle(document.documentElement);
      const ws = WS.create({
        container: waveRef.current!,
        media: audioRef.current!,
        height: 64,
        waveColor: css.getPropertyValue("--neutral-1").trim() || "#a3a29c",
        progressColor: css.getPropertyValue("--s1").trim() || "#2a78d6",
        cursorColor: css.getPropertyValue("--text").trim() || "#0b0b0b",
        barWidth: 2, barGap: 1, barRadius: 2, normalize: true,
      });
      ws.on("error", () => setWaveOk(false));
      wsRef.current = ws;
    })();
    return () => { destroyed = true; wsRef.current?.destroy(); wsRef.current = null; };
  }, [src]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("play", onPlay); a.removeEventListener("pause", onPause); };
  }, []);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a || t < 0) return;
    a.currentTime = t;
    setTime(t);
    a.play().catch(() => {});
  }, []);

  const activeIdx = segments.findIndex((s) => time >= s.start - 0.05 && time <= s.end + 0.3);
  useEffect(() => {
    if (!follow || activeIdx < 0 || !playing) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, follow, playing]);

  const total = Math.max(durationS, segments.length ? segments[segments.length - 1].end : 0, 1);
  const kinds = [...new Set(events.map((e) => e.kind))];

  return (
    <SeekCtx.Provider value={seek}>
      <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5">
        <section className="bg-surface border border-line min-w-0 rounded-xl">
          <div className="p-4 border-b border-line">
            <h2 className="section-title mb-3">Recording</h2>
            {src ? (
              <>
                <div ref={waveRef} className={cx(!waveOk && "hidden")} aria-label="Waveform" />
                <audio ref={audioRef} src={src} preload="metadata" controls={!waveOk} className={cx("w-full", waveOk && "hidden")} crossOrigin="anonymous" />
                {waveOk && (
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={() => (playing ? audioRef.current?.pause() : audioRef.current?.play())}
                      className="bg-ink text-bg px-3 py-1.5 text-xs font-medium w-20 rounded-lg">{playing ? "Pause" : "Play"}</button>
                    <span className="text-xs tabular text-dim">{fmt(time)} / {fmt(total)}</span>
                    {[1, 1.5, 2].map((r) => (
                      <button key={r} onClick={() => { if (audioRef.current) audioRef.current.playbackRate = r; }} className="text-xs text-dim hover:text-ink">{r}×</button>
                    ))}
                  </div>
                )}
              </>
            ) : <p className="text-sm text-dim">No recording available for this call (recording may be disabled in the agent&apos;s data-storage settings).</p>}

            {/* Speaker lanes + event markers */}
            {segments.length > 0 && (
              <div className="mt-4 space-y-1.5" aria-label="Conversation timeline">
                {(["agent", "user"] as const).map((role) => (
                  <div key={role} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-dim">{role === "agent" ? agentName : "Caller"}</span>
                    <div className="relative h-4 flex-1 bg-surface-3">
                      {segments.filter((s) => s.role === role).map((s, i) => (
                        <button key={i} title={s.text} onClick={() => seek(s.start)}
                          className={cx("absolute top-0 h-full", role === "agent" ? "bg-[var(--s1)]" : s.backchannel ? "bg-[var(--neutral-2)]" : "bg-[var(--text)]")}
                          style={{ left: `${(s.start / total) * 100}%`, width: `${Math.max(0.4, ((s.end - s.start) / total) * 100)}%` }} />
                      ))}
                      <div className="absolute top-[-3px] bottom-[-3px] w-px bg-bad pointer-events-none" style={{ left: `${(time / total) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {events.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-dim">Issues</span>
                    <div className="relative h-4 flex-1">
                      {events.map((e, i) => (
                        <button key={i} title={`${fmt(e.start)} ${e.note}`} onClick={() => seek(Math.max(0, e.start - 1))}
                          className={cx("absolute top-0.5 h-3 min-w-2 rounded-sm ring-2 ring-[var(--surface)]", EVENT_STYLE[e.kind]?.cls ?? "bg-muted")}
                          style={{ left: `${(e.start / total) * 100}%`, width: `${Math.max(0.6, ((e.end - e.start) / total) * 100)}%` }} />
                      ))}
                    </div>
                  </div>
                )}
                {kinds.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pl-16 pt-1">
                    {kinds.map((k) => (
                      <span key={k} className="inline-flex items-center gap-1.5 text-xs text-dim">
                        <span className={cx("w-2.5 h-2.5 rounded-sm", EVENT_STYLE[k]?.cls)} />{EVENT_STYLE[k]?.label ?? k} ({events.filter((e) => e.kind === k).length})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="section-title">Transcript</h2>
            <label className="text-xs text-dim flex items-center gap-1.5"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow audio</label>
          </div>
          <div ref={listRef} className="p-4 space-y-2 max-h-[560px] overflow-y-auto">
            {segments.length === 0 && <p className="text-sm text-dim">No transcript available.</p>}
            {segments.map((s, i) => {
              const evHere = events.filter((e) => e.start >= s.start - 0.3 && e.start <= s.end + 0.3 && (e.kind !== "silence"));
              return (
                <div key={i} data-idx={i} className={cx("flex", s.role === "agent" ? "justify-start" : "justify-end")}>
                  <button onClick={() => seek(s.start)}
                    className={cx("text-left max-w-[88%] px-3 py-2 text-[13px] leading-relaxed transition",
                      s.role === "agent" ? "bg-surface-2 text-ink rounded-xl rounded-tl-md" : "bg-zinc-900/[.06] text-ink rounded-xl rounded-tr-md",
                      s.backchannel && "opacity-60",
                      i === activeIdx && "ring-2 ring-zinc-900/70")}>
                    <div className="flex items-center gap-2 text-xs font-medium text-dim mb-0.5">
                      <span>{s.role === "agent" ? agentName : "Caller"}</span><span className="tabular">{fmt(s.start)}</span>
                      {evHere.map((e, j) => <span key={j} className={cx("px-1.5 rounded-md text-black", EVENT_STYLE[e.kind]?.cls)}>{EVENT_STYLE[e.kind]?.label}</span>)}
                    </div>
                    {s.text}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </SeekCtx.Provider>
  );
}

export function SeekTime({ at, children }: { at: number; children?: React.ReactNode }) {
  const seek = useSeek();
  if (at < 0) return null;
  return (
    <button onClick={() => seek(Math.max(0, at - 1))} className="text-xs font-medium text-dim bg-surface-2 border border-line-strong px-1.5 py-0.5 hover:bg-surface-3 hover:text-ink shrink-0 rounded-md">
      {children ?? fmt(at)} ▶
    </button>
  );
}
