"use client";

import type { CallDrawerData } from "@/lib/calls/drawer";
import { CATEGORY_LABEL, type Moment } from "@/lib/humanlike/schema";
import { cx } from "@/components/ui";

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

export function HumanlikeTab({ data, onSeek }: { data: CallDrawerData; onSeek: (t: number) => void }) {
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
              </div>
              <p className="mt-2 text-[13.5px] font-medium text-zinc-900">{m.what}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{m.why}</p>
              {m.fix && <p className="mt-2 text-[13px] leading-relaxed text-zinc-800"><span className="font-medium">Fix: </span>{m.fix}</p>}
            </li>
          ))}
          {!r.moments.length && <li className="text-[13px] text-zinc-500">No notable moments.</li>}
        </ul>
      </div>

      <p className="text-[12px] text-zinc-400">
        {r.source === "sample" ? "Sample review: the demo calls have no real recordings." : r.source === "acoustic_only" ? "Measured from the recording and word timings only. Add an ANTHROPIC_API_KEY for the full AI review (listening and accuracy)." : `Voice measured from the recording${r.acoustic.analyzed ? "" : " (not measurable for this call)"}; reviewed by Claude Sonnet 5.5.`}
      </p>
    </div>
  );
}
