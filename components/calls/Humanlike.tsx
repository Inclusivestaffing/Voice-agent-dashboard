"use client";

import { useEffect, useState } from "react";
import type { CallDrawerData } from "@/lib/calls/drawer";
import { CATEGORY_LABEL, listened, type Listening, type Moment } from "@/lib/humanlike/schema";
import { DOWN_REASONS, downReasonLabel, momentKey, type CallFeedback, type DownReason, type FeedbackInput, type ScoreVote } from "@/lib/humanlike/feedback";
import { cx } from "@/components/ui";
import { toast } from "@/components/feedback/Toaster";

const KIND = {
  mistake: { label: "Mistake", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  robotic: { label: "Robotic", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  natural: { label: "Natural", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
} as const;

const SUB: [keyof NonNullable<CallDrawerData["humanlike"]>["subscores"], string, string][] = [
  ["voice", "Voice", "Pitch movement, pace and rhythm, measured from the recording"],
  ["timing", "Timing", "Response delays, talking over the caller, pauses"],
  ["flow", "Flow", "Natural phrasing vs scripted or repeated lines"],
  ["listening", "Listening", "Acknowledged and adapted to what the caller said"],
  ["accuracy", "Accuracy", "Right information, right handling"],
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const tone = (v: number) => (v >= 85 ? "text-emerald-600" : v >= 70 ? "text-zinc-900" : v >= 50 ? "text-amber-600" : "text-rose-600");
const bar = (v: number) => (v >= 85 ? "bg-emerald-500" : v >= 70 ? "bg-zinc-800" : v >= 50 ? "bg-amber-500" : "bg-rose-500");

/** Colored markers over the call's length; click one to play from that moment. */
export function MomentMarkers({ moments, durationS, onSeek }: { moments: Moment[]; durationS: number; onSeek: (t: number) => void }) {
  if (!moments.length || !durationS) return null;
  return (
    <div className="relative mt-2 h-5" aria-label="Human-likeness moments on the call timeline">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-200" aria-hidden />
      {moments.map((m, i) => (
        <button key={i} type="button" onClick={() => onSeek(m.at_s)}
          title={`${clock(m.at_s)} · ${KIND[m.kind].label}: ${m.what}`} aria-label={`Play ${KIND[m.kind].label.toLowerCase()} moment at ${clock(m.at_s)}`}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center rounded-full hover:bg-zinc-100"
          style={{ left: `${Math.min(100, Math.max(0, (m.at_s / durationS) * 100))}%` }}>
          <span className={cx("h-2.5 w-2.5 rounded-full ring-2 ring-white", KIND[m.kind].dot)} />
        </button>
      ))}
    </div>
  );
}

const ThumbUp = () => <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>;
const ThumbDown = () => <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>;
const SCORE_LABEL: Record<ScoreVote, string> = { low: "Too low", right: "About right", high: "Too high" };
const Ear = ({ className = "h-3.5 w-3.5" }: { className?: string }) => <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0" /><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" /></svg>;
const mosTone = (v: number) => (v >= 4 ? "text-emerald-600" : v >= 3 ? "text-zinc-900" : v >= 2 ? "text-amber-600" : "text-rose-600");

/** What the listening AI heard: a 1–5 naturalness rating and its reasoning (or why it didn't run). */
function VoiceHeard({ l }: { l: Listening }) {
  if (!listened(l)) {
    return <p className="rounded-xl border border-dashed border-zinc-300 px-3.5 py-2.5 text-[12.5px] text-zinc-500">The AI listening check didn&apos;t run on this call: {l.error}.</p>;
  }
  return (
    <div className="rounded-xl border border-zinc-200/80 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-900"><Ear />How the voice sounds</h4>
        <span className="text-[12.5px] text-zinc-500"><span className={cx("text-[20px] font-semibold leading-none tabular", mosTone(l.mos))}>{l.mos.toFixed(1)}</span> / 5 naturalness</span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-700">{l.reason}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
        {l.model === "sample" ? "Sample result." : "An AI (Google Gemini) listened to the agent's side of the call."} Listening AIs agree with people about 7 times in 10, so treat this as a second opinion. Your thumbs up or down on moments marked &ldquo;Heard&rdquo; show how often it&apos;s right on your calls.
      </p>
    </div>
  );
}

/** Local (optimistic) version of a feedback change; the server's copy replaces it once saved. */
function applyLocal(f: CallFeedback, input: FeedbackInput): CallFeedback {
  const next: CallFeedback = { ...f, moments: { ...f.moments } };
  const at = new Date().toISOString();
  if (input.type === "moment") {
    if (input.vote) next.moments[input.key] = { vote: input.vote, ...(input.vote === "down" && input.reason ? { reason: input.reason } : {}), at };
    else delete next.moments[input.key];
  } else if (input.type === "score") {
    if (input.vote) next.score = { vote: input.vote, at }; else delete next.score;
  } else if (input.text.trim()) next.missed = { text: input.text.trim(), at }; else delete next.missed;
  return next;
}

function useFeedback(data: CallDrawerData, url: string | null, onSaved?: (f: CallFeedback) => void) {
  const [fb, setFb] = useState<CallFeedback | null>(data.humanlike_feedback);
  useEffect(() => { setFb(data.humanlike_feedback); }, [data.call_id, data.humanlike_feedback]);
  const send = async (input: FeedbackInput) => {
    if (!url || !fb) return;
    const before = fb;
    setFb(applyLocal(fb, input));
    try {
      const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.feedback) throw new Error(body.error || "Couldn't save feedback.");
      setFb(body.feedback); onSaved?.(body.feedback);
      if (input.type === "missed") toast("Thanks, noted");
    } catch (e) {
      setFb(before); toast(e instanceof Error ? e.message : "Couldn't save feedback.", "error");
    }
  };
  return { fb, send, enabled: !!url && !!fb };
}

function MomentVoteBar({ m, fb, send }: { m: Moment; fb: CallFeedback; send: (i: FeedbackInput) => void }) {
  const key = momentKey(m);
  const cur = fb.moments[key];
  const btn = (on: boolean, tone: "up" | "down") => cx("inline-flex h-7 w-8 items-center justify-center rounded-md border transition-colors",
    on ? (tone === "up" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700") : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900");
  return (
    <div className="mt-3 border-t border-zinc-100 pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-zinc-500">Is this right?</span>
        <button type="button" aria-pressed={cur?.vote === "up"} aria-label="Yes, this finding is right" title="Yes, this is right"
          onClick={() => send({ type: "moment", key, vote: cur?.vote === "up" ? null : "up" })} className={btn(cur?.vote === "up", "up")}><ThumbUp /></button>
        <button type="button" aria-pressed={cur?.vote === "down"} aria-label="No, this finding is wrong" title="No, this is wrong"
          onClick={() => send({ type: "moment", key, vote: cur?.vote === "down" ? null : "down" })} className={btn(cur?.vote === "down", "down")}><ThumbDown /></button>
        {cur?.vote === "up" && <span className="text-[12px] text-emerald-700">Confirmed</span>}
      </div>
      {cur?.vote === "down" && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="What was wrong?">
          {DOWN_REASONS.map((r: DownReason) => (
            <button key={r} type="button" aria-pressed={cur.reason === r} onClick={() => send({ type: "moment", key, vote: "down", reason: cur.reason === r ? null : r })}
              className={cx("h-7 rounded-full border px-2.5 text-[12px]", cur.reason === r ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900")}>
              {downReasonLabel(r, m.kind)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MissedBox({ fb, send }: { fb: CallFeedback; send: (i: FeedbackInput) => void }) {
  const [text, setText] = useState(fb.missed?.text ?? "");
  useEffect(() => { setText(fb.missed?.text ?? ""); }, [fb.missed?.text]);
  const dirty = text.trim() !== (fb.missed?.text ?? "");
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-3.5">
      <label htmlFor="hl-missed" className="text-[13px] font-medium text-zinc-900">Did it miss anything?</label>
      <p className="text-[12px] text-zinc-500">A robotic moment or mistake you heard that isn&apos;t listed. Include the time if you can.</p>
      <textarea id="hl-missed" value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={2} placeholder="e.g. 1:12 it read the address too fast"
        className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 focus:border-zinc-400 focus-visible:outline-none focus:ring-4 focus:ring-zinc-900/5" />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={!dirty} onClick={() => send({ type: "missed", text })}
          className="h-8 rounded-lg bg-zinc-900 px-3 text-[12.5px] font-medium text-white disabled:opacity-40">Save</button>
        {fb.missed && !dirty && <span className="text-[12px] text-zinc-500">Saved</span>}
      </div>
    </div>
  );
}

export function HumanlikeTab({ data, onSeek, feedbackUrl = null, onFeedback }: { data: CallDrawerData; onSeek: (t: number) => void; feedbackUrl?: string | null; onFeedback?: (f: CallFeedback) => void }) {
  const { fb, send, enabled } = useFeedback(data, feedbackUrl, onFeedback);
  const r = data.humanlike;
  if (!r) {
    const msg = data.humanlike_status === "pending"
      ? data.humanlike_note ?? "Analyzing this call now."
      : data.humanlike_status === "skipped" ? `Not judged: ${data.humanlike_note ?? "not enough speech."}`
      : "Human-likeness analysis isn't available for this call.";
    return (
      <div className="py-10 text-center">
        {data.humanlike_status === "pending" && <span className="mx-auto mb-3 block h-5 w-5 rounded-full border-2 border-zinc-900 border-r-transparent animate-spin" aria-hidden />}
        <p className="text-[13.5px] text-zinc-500" role="status">{msg}</p>
      </div>
    );
  }
  const counts = { mistake: 0, robotic: 0, natural: 0 };
  r.moments.forEach((m) => counts[m.kind]++);
  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="flex items-center gap-5">
        <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`Human-likeness score ${r.score} out of 100`}>
          <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f0f0f2" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
              className={cx(r.score >= 85 ? "stroke-emerald-500" : r.score >= 70 ? "stroke-zinc-900" : r.score >= 50 ? "stroke-amber-500" : "stroke-rose-500")}
              strokeDasharray={`${(r.score / 100) * 97.4} 97.4`} />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div><div className={cx("text-[26px] font-semibold leading-none tabular", tone(r.score))}>{r.score}</div><div className="text-[10px] text-zinc-400 mt-0.5">/ 100</div></div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[17px] font-semibold text-zinc-900">{r.label}</div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-zinc-600">{r.verdict}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
            {(["mistake", "robotic", "natural"] as const).map((k) => (
              <span key={k} className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 h-6", KIND[k].chip)}>
                <span className={cx("h-1.5 w-1.5 rounded-full", KIND[k].dot)} aria-hidden />{counts[k]} {KIND[k].label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      </div>

      {enabled && fb && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-zinc-500">Does this score feel right?</span>
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5" role="group" aria-label="Does this score feel right?">
            {(["low", "right", "high"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={fb.score?.vote === v} onClick={() => send({ type: "score", vote: fb.score?.vote === v ? null : v })}
                className={cx("h-7 rounded-md px-2.5 text-[12px] font-medium", fb.score?.vote === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}>{SCORE_LABEL[v]}</button>
            ))}
          </div>
        </div>
      )}

      {/* Sub-scores */}
      <dl className="space-y-2.5">
        {SUB.map(([k, label, hint]) => {
          const v = r.subscores[k];
          return (
            <div key={k} className="grid grid-cols-[88px_1fr_32px] items-center gap-3 text-[13px]" title={hint}>
              <dt className="text-zinc-600">{label}</dt>
              <dd className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">{v != null && <div className={cx("h-full rounded-full", bar(v))} style={{ width: `${v}%` }} />}</dd>
              <span className="text-right tabular text-zinc-900">{v ?? "—"}</span>
            </div>
          );
        })}
      </dl>

      {r.listening && <VoiceHeard l={r.listening} />}

      <p className="text-[14px] leading-relaxed text-zinc-700">{r.summary}</p>

      {r.top_fixes.length > 0 && (
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4">
          <h4 className="text-[13px] font-semibold text-zinc-900">Top fixes to sound more human</h4>
          <ol className="mt-2 space-y-1.5 text-[13.5px] text-zinc-700 list-decimal pl-5">{r.top_fixes.map((f, i) => <li key={i}>{f}</li>)}</ol>
        </div>
      )}

      {/* Moments */}
      <div>
        <h4 className="text-[13px] font-semibold text-zinc-900">Moments</h4>
        <ul className="mt-2 space-y-2.5">
          {r.moments.map((m, i) => (
            <li key={i} className="rounded-xl border border-zinc-200/80 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onSeek(m.at_s)} className="h-6 rounded-md border border-zinc-200 px-1.5 text-[11.5px] tabular text-zinc-600 hover:border-zinc-300 hover:text-zinc-900" aria-label={`Play from ${clock(m.at_s)}`}>▶ {clock(m.at_s)}</button>
                <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium", KIND[m.kind].chip)}>
                  <span className={cx("h-1.5 w-1.5 rounded-full", KIND[m.kind].dot)} aria-hidden />{KIND[m.kind].label}
                </span>
                <span className="text-[12px] text-zinc-500">{CATEGORY_LABEL[m.category] ?? m.category}</span>
                {m.heard && <span className="inline-flex h-6 items-center gap-1 rounded-md border border-zinc-200 px-1.5 text-[11.5px] font-medium text-zinc-600" title="Found by the AI that listened to the audio"><Ear className="h-3 w-3" />Heard</span>}
              </div>
              <p className="mt-2 text-[13.5px] font-medium text-zinc-900">{m.what}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{m.why}</p>
              {m.fix && <p className="mt-2 text-[13px] leading-relaxed text-zinc-800"><span className="font-medium">Fix: </span>{m.fix}</p>}
              {enabled && fb && <MomentVoteBar m={m} fb={fb} send={send} />}
            </li>
          ))}
          {!r.moments.length && <li className="text-[13px] text-zinc-500">No notable moments.</li>}
        </ul>
      </div>

      {enabled && fb && <MissedBox fb={fb} send={send} />}
      {enabled && <p className="text-[12px] text-zinc-500">Your answers measure how accurate this analysis is (see Analytics) and guide future AI reviews for this workspace.</p>}

      <p className="text-[12px] text-zinc-400">
        {r.source === "sample" ? "Sample review: the demo calls have no real recordings."
          : r.source === "acoustic_only" ? `${listened(r.listening) ? "Voice heard by Google Gemini and measured from the recording" : "Measured from the recording and word timings only"}. Add an ANTHROPIC_API_KEY for the full AI review of what was said (listening and accuracy).`
          : `Voice measured from the recording${r.acoustic.analyzed ? "" : " (not measurable for this call)"}${listened(r.listening) ? " and heard by Google Gemini" : ""}; reviewed by Claude Sonnet 5.5.`}
      </p>
    </div>
  );
}
