"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cx } from "@/components/ui";

export interface CallAudioHandle { seek: (seconds: number) => void; toggle: () => void }
type Line = { role: string; content: string; start: number | null; end: number | null };

const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};
const RATES = [1, 1.25, 1.5, 2];

const PlayIcon = () => <svg className="h-4 w-4 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>;
const PauseIcon = () => <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="4.5" width="4" height="15" rx="1.2" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" /></svg>;

/**
 * Call audio player. Plays the Retell recording when there is one; for demo calls (no recording)
 * it reads the transcript aloud with the browser's speech voices so the flow can still be heard.
 * Reports the playhead through `onTime` so the transcript can follow along.
 */
const CallAudio = forwardRef<CallAudioHandle, {
  src: string | null; transcript: Line[]; durationS: number; onTime: (t: number) => void; onPlaying?: (p: boolean) => void; fileName: string;
  /** Shown when there's no recording and the transcript is read aloud instead. */
  previewNote?: string;
}>(function CallAudio({ src, transcript, durationS, onTime, onPlaying, fileName, previewNote }, ref) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(durationS);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const tts = !src;
  const ttsOk = typeof window !== "undefined" && "speechSynthesis" in window;
  const ttsState = useRef({ idx: 0, token: 0, timer: 0 as unknown as ReturnType<typeof setInterval> });

  const report = useCallback((t: number) => { setTime(t); onTime(t); }, [onTime]);
  useEffect(() => { onPlaying?.(playing); }, [playing, onPlaying]);

  // ── Voice preview (speech synthesis) ──
  const lines = transcript.filter((l) => l.start != null);
  const stopSpeech = useCallback(() => {
    ttsState.current.token++;
    clearInterval(ttsState.current.timer);
    if (ttsOk) window.speechSynthesis.cancel();
  }, [ttsOk]);

  const speakFrom = useCallback((idx: number) => {
    if (!ttsOk || !lines.length) return;
    stopSpeech();
    const token = ttsState.current.token;
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
    const agentVoice = voices.find((v) => /female|samantha|zira|aria|jenny|google us english/i.test(v.name)) ?? voices[0];
    const callerVoice = voices.find((v) => v !== agentVoice && /male|david|guy|daniel|mark/i.test(v.name)) ?? voices.find((v) => v !== agentVoice) ?? agentVoice;
    const next = (i: number) => {
      if (token !== ttsState.current.token) return;
      if (i >= lines.length) { setPlaying(false); report(dur); return; }
      ttsState.current.idx = i;
      const l = lines[i];
      const u = new SpeechSynthesisUtterance(l.content);
      if (l.role === "agent") { if (agentVoice) u.voice = agentVoice; u.pitch = 1.05; } else { if (callerVoice) u.voice = callerVoice; u.pitch = 0.9; }
      u.rate = rate;
      const start = l.start ?? 0, end = Math.max(start + 0.5, l.end ?? start + 2);
      u.onstart = () => {
        if (token !== ttsState.current.token) return;
        report(start);
        clearInterval(ttsState.current.timer);
        const t0 = performance.now();
        const est = Math.max(0.6, l.content.split(/\s+/).length / (2.6 * rate));
        ttsState.current.timer = setInterval(() => {
          const p = Math.min(1, (performance.now() - t0) / 1000 / est);
          report(start + (end - start) * p);
        }, 120);
      };
      u.onend = () => { clearInterval(ttsState.current.timer); next(i + 1); };
      u.onerror = () => { clearInterval(ttsState.current.timer); if (token === ttsState.current.token) setPlaying(false); };
      window.speechSynthesis.speak(u);
    };
    setPlaying(true);
    next(idx);
  }, [ttsOk, lines, stopSpeech, rate, report, dur]);

  const idxAt = useCallback((t: number) => {
    let i = 0;
    lines.forEach((l, k) => { if ((l.start ?? 0) <= t + 0.05) i = k; });
    return i;
  }, [lines]);

  const toggle = useCallback(() => {
    if (tts) {
      if (!ttsOk) return;
      if (playing) { stopSpeech(); setPlaying(false); } else speakFrom(time >= dur - 0.2 ? 0 : idxAt(time));
      return;
    }
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setError("This recording couldn't be played. It may have expired in Retell.")); else a.pause();
  }, [tts, ttsOk, playing, stopSpeech, speakFrom, time, dur, idxAt]);

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(dur || t, t));
    if (tts) {
      report(clamped);
      if (playing) speakFrom(idxAt(clamped));
      return;
    }
    const a = audio.current;
    if (a) { a.currentTime = clamped; report(clamped); if (a.paused) a.play().catch(() => {}); }
  }, [tts, dur, report, playing, speakFrom, idxAt]);

  useImperativeHandle(ref, () => ({ seek, toggle }), [seek, toggle]);

  // Stop everything when the panel closes or switches call.
  useEffect(() => () => { stopSpeech(); audio.current?.pause(); }, [stopSpeech]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = rate; }, [rate]);

  const pct = dur > 0 ? Math.min(100, (time / dur) * 100) : 0;
  const disabled = tts ? !ttsOk || !lines.length : !!error;

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-2.5">
      {src && (
        <audio ref={audio} src={src} preload="metadata" className="hidden"
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }}
          onTimeUpdate={(e) => report(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onError={() => setError("This recording couldn't be loaded. It may have expired in Retell.")} />
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={toggle} disabled={disabled} aria-label={playing ? "Pause" : "Play"}
          className="h-10 w-10 shrink-0 rounded-full bg-zinc-900 text-white grid place-items-center shadow-[0_1px_2px_rgb(24_24_27/0.25)] hover:bg-zinc-800 disabled:opacity-40">
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="text-[12px] tabular text-zinc-600 w-[78px] shrink-0">{clock(time)} / {clock(dur)}</span>
        <div className="relative flex-1 h-5 grid items-center group">
          <div className="h-1.5 rounded-full bg-zinc-200 overflow-hidden"><div className="h-full rounded-full bg-zinc-900" style={{ width: `${pct}%` }} /></div>
          <input type="range" min={0} max={Math.max(1, dur)} step={0.1} value={Math.min(time, dur)} disabled={disabled}
            onChange={(e) => seek(Number(e.target.value))} aria-label="Seek"
            className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
          <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white border border-zinc-300 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${pct}%` }} />
        </div>
        <button type="button" onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])} disabled={disabled}
          className="h-7 min-w-[42px] rounded-md px-1.5 text-[12px] font-medium tabular text-zinc-600 hover:bg-zinc-200/60 disabled:opacity-40" aria-label={`Playback speed ${rate}x`}>
          {rate}x
        </button>
        {src && (
          <a href={src} download={fileName} target="_blank" rel="noreferrer" aria-label="Download recording"
            className="h-8 w-8 shrink-0 rounded-lg border border-zinc-200 bg-white grid place-items-center text-zinc-600 hover:text-zinc-900 hover:border-zinc-300">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16" /></svg>
          </a>
        )}
      </div>
      {(tts || error) && (
        <p className={cx("mt-2 px-1 text-[12px]", error ? "text-bad" : "text-zinc-500")}>
          {error ?? (ttsOk ? previewNote ?? "Voice preview: there's no recording, so the transcript is read aloud." : "This browser can't read the transcript aloud.")}
        </p>
      )}
    </div>
  );
});

export default CallAudio;
