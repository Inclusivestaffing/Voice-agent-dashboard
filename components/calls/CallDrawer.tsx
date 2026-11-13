"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CallDrawerData } from "@/lib/calls/drawer";
import type { CallDiagnosis } from "@/lib/ai/schemas";
import { OUTCOME_LABEL, ROOT_CAUSE_LABEL, type Outcome, type RootCause } from "@/lib/types";
import { OutcomePill, cx, fmtDur, fmtMoney, fmtMs, humanize } from "@/components/ui";
import { toast } from "@/components/feedback/Toaster";
import CallAudio, { type CallAudioHandle } from "./CallAudio";

const cache = new Map<string, CallDrawerData>();
async function load(url: string, signal?: AbortSignal): Promise<CallDrawerData> {
  const hit = cache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { signal, credentials: "same-origin" });
  if (!res.ok) throw new Error(res.status === 404 ? "This call wasn't found." : "Couldn't load this call.");
  const data = (await res.json()) as CallDrawerData;
  cache.set(url, data);
  return data;
}

const TABS = ["Transcript", "AI analysis", "Data", "Details"] as const;
type Tab = (typeof TABS)[number];

/**
 * Right-side slide-over with everything about one call: header facts, audio, Retell's
 * conversation analysis, summary, transcript (synced to playback), AI diagnosis, variables,
 * latency and cost, plus the caller's other calls. ↑/↓ moves through the list behind it.
 */
export default function CallDrawer({ callId, apiBase, fullHref, timezone, ids, onNavigate, onClose }: {
  callId: string; apiBase: string; fullHref: (id: string) => string; timezone: string; ids: string[];
  onNavigate: (id: string) => void; onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [data, setData] = useState<CallDrawerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Transcript");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const player = useRef<CallAudioHandle>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const idx = ids.indexOf(callId);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

  // Enter animation on mount; remember where focus was so closing returns it.
  useEffect(() => {
    setMounted(true);
    returnFocus.current = document.activeElement as HTMLElement | null;
    const r = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(r); document.body.style.overflow = prev; returnFocus.current?.focus?.(); };
  }, []);

  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  // Load the call (cached), then quietly prefetch its neighbours so ↑/↓ is instant.
  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    setTime(0);
    const url = `${apiBase}/${encodeURIComponent(callId)}`;
    const cached = cache.get(url);
    setData(cached ?? null);
    if (!cached) {
      load(url, ctrl.signal).then(setData).catch((e) => { if (!ctrl.signal.aborted) setError(e.message); });
    }
    for (const n of [prevId, nextId]) if (n) load(`${apiBase}/${encodeURIComponent(n)}`).catch(() => {});
    panel.current?.querySelector<HTMLElement>("[data-scroll]")?.scrollTo({ top: 0 });
    return () => ctrl.abort();
  }, [callId, apiBase, prevId, nextId]);

  useEffect(() => { panel.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowUp" && prevId) { e.preventDefault(); onNavigate(prevId); }
      else if (e.key === "ArrowDown" && nextId) { e.preventDefault(); onNavigate(nextId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, prevId, nextId, onNavigate]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast("Couldn't copy", "error"); }
  };

  // Portals need the DOM; on a deep link (?call=…) the first render happens on the server.
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[75]" role="presentation">
      <div onClick={close} aria-hidden
        className={cx("absolute inset-0 bg-zinc-900/20 transition-opacity duration-200", shown ? "opacity-100" : "opacity-0")} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Call details" tabIndex={-1}
        className={cx(
          "absolute inset-y-0 right-0 flex w-full max-w-[1120px] flex-col bg-white shadow-[-24px_0_48px_-24px_rgb(24_24_27/0.25)] outline-none sm:rounded-l-2xl sm:border-l sm:border-zinc-200/80",
          "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] will-change-transform",
          shown ? "translate-x-0" : "translate-x-full",
        )}>
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200/80 px-3 sm:px-4">
          <div className="flex items-center gap-1">
            <NavBtn label="Previous call" disabled={!prevId} onClick={() => prevId && onNavigate(prevId)} d="m18 15-6-6-6 6" />
            <NavBtn label="Next call" disabled={!nextId} onClick={() => nextId && onNavigate(nextId)} d="m6 9 6 6 6-6" />
          </div>
          <span className="hidden sm:inline text-[12px] text-zinc-500">Use <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> to move between calls</span>
          {idx >= 0 && <span className="text-[12px] tabular text-zinc-400 ml-1">{idx + 1} of {ids.length}</span>}
          <div className="ml-auto flex items-center gap-1">
            <Link href={fullHref(callId)} className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
              Open full page
            </Link>
            <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 grid place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex-1 grid place-items-center p-8 text-center">
            <div>
              <p className="text-sm text-zinc-700">{error}</p>
              <button type="button" onClick={() => { cache.delete(`${apiBase}/${encodeURIComponent(callId)}`); setError(null); load(`${apiBase}/${encodeURIComponent(callId)}`).then(setData).catch((e) => setError(e.message)); }}
                className="mt-3 h-8 rounded-lg border border-zinc-200 px-3 text-[13px] font-medium hover:bg-zinc-50">Try again</button>
            </div>
          </div>
        ) : !data ? (
          <DrawerSkeleton />
        ) : (
          <div data-scroll className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Left column */}
            <div className="min-w-0 lg:overflow-y-auto lg:overscroll-contain">
              <section className="px-5 sm:px-6 pt-5 pb-5 border-b border-zinc-200/70">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-zinc-900">{fmtWhen(data.start_ts, timezone)}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Chip>{data.call_type === "web_call" ? "Web call" : "Phone call"}</Chip>
                      {data.direction && <Chip>{humanize(data.direction)}</Chip>}
                      {data.outcome && <OutcomePill outcome={data.outcome} />}
                    </div>
                  </div>
                </div>
                <dl className="mt-4 grid gap-y-1.5 text-[13px]">
                  <Meta label="Agent">
                    {data.agent_name ?? "—"}
                    {data.agent_id && <span className="ml-1 text-zinc-400">({short(data.agent_id)})</span>}
                    {data.agent_id && <CopyBtn onClick={() => copy(data.agent_id!, "Agent ID")} />}
                    {data.agent_version != null && <span className="ml-3 text-zinc-500">Version <span className="text-zinc-900 tabular">{data.agent_version}</span></span>}
                  </Meta>
                  <Meta label="Call ID"><span className="font-mono text-[12px]">{short(data.call_id, 26)}</span><CopyBtn onClick={() => copy(data.call_id, "Call ID")} /></Meta>
                  <Meta label={data.call_type === "web_call" ? "Web call" : "Phone call"}>
                    <span className="tabular">{data.from_number ?? "Unknown"}</span>
                    <span className="text-zinc-400 mx-1.5" aria-label="to">→</span>
                    <span className="tabular">{data.to_number ?? "—"}</span>
                    {data.direction && <span className="ml-1 text-zinc-500">({humanize(data.direction)})</span>}
                  </Meta>
                  <Meta label="Duration">
                    <span className="tabular">{fmtClock(data.start_ts, timezone)} – {fmtClock(data.end_ts, timezone)}</span>
                    <span className="ml-1 text-zinc-500">({fmtDur(data.duration_ms == null ? null : data.duration_ms / 1000)})</span>
                  </Meta>
                  <Meta label="Cost"><span className="tabular">{fmtMoney(data.combined_cost_cents)}</span></Meta>
                </dl>
                <div className="mt-4">
                  <CallAudio key={data.call_id} ref={player} src={data.recording_url} transcript={data.transcript}
                    durationS={(data.duration_ms ?? 0) / 1000 || (data.transcript.at(-1)?.end ?? 0)} onTime={setTime} onPlaying={setPlaying}
                    fileName={`${data.call_id}.wav`}
                    previewNote={data.voice_preview
                      ? "Voice preview: demo calls have no recording, so the transcript is read aloud. Live calls play the Retell recording."
                      : "No recording for this call (recording may be turned off in the agent's data storage settings in Retell), so the transcript is read aloud."} />
                </div>
              </section>

              <section className="px-5 sm:px-6 py-5 border-b border-zinc-200/70">
                <h3 className="text-[14px] font-semibold text-zinc-900">Conversation analysis</h3>
                <dl className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-2.5 text-[13px]">
                  <Fact label="Call successful" dot={data.call_successful == null ? "bg-zinc-300" : data.call_successful ? "bg-emerald-500" : "bg-rose-500"}>
                    {data.call_successful == null ? "Unknown" : data.call_successful ? "Successful" : "Unsuccessful"}
                  </Fact>
                  <Fact label="Call status" dot={data.call_status === "ended" ? "bg-zinc-400" : data.call_status === "error" ? "bg-rose-500" : "bg-amber-400"}>{humanize(data.call_status ?? "—")}</Fact>
                  <Fact label="User sentiment" dot={data.user_sentiment === "Positive" ? "bg-emerald-500" : data.user_sentiment === "Negative" ? "bg-rose-500" : "bg-sky-500"}>{data.user_sentiment ?? "Unknown"}</Fact>
                  <Fact label="Disconnection reason" dot="bg-emerald-500">{humanize(data.disconnection_reason ?? "—")}</Fact>
                  {data.analysis && (
                    <>
                      <Fact label="AI outcome" dot="bg-zinc-900">{OUTCOME_LABEL[(data.outcome ?? data.analysis.outcome) as Outcome] ?? humanize(data.outcome ?? "")}</Fact>
                      <Fact label="AI score" dot={(data.overall_score ?? 100) < 50 ? "bg-rose-500" : "bg-emerald-500"}>{data.overall_score == null ? "—" : <span className="tabular">{data.overall_score}/100</span>}</Fact>
                    </>
                  )}
                </dl>
              </section>

              {(data.summary || data.analysis?.plain_english_summary) && (
                <section className="px-5 sm:px-6 py-5 border-b border-zinc-200/70">
                  <h3 className="text-[14px] font-semibold text-zinc-900">Summary</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-zinc-700">{data.analysis?.plain_english_summary ?? data.summary}</p>
                </section>
              )}

              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-5 sm:px-6 border-b border-zinc-200/70">
                <div role="tablist" aria-label="Call details" className="flex gap-5 overflow-x-auto">
                  {TABS.map((t) => (
                    <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                      className={cx("relative h-11 shrink-0 text-[13.5px] font-medium transition-colors",
                        tab === t ? "text-zinc-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-zinc-900" : "text-zinc-500 hover:text-zinc-800")}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-5 sm:px-6 py-5" role="tabpanel">
                {tab === "Transcript" && <Transcript data={data} time={time} playing={playing} onSeek={(t) => player.current?.seek(t)} />}
                {tab === "AI analysis" && <AiAnalysis data={data} onSeek={(t) => { setTab("Transcript"); player.current?.seek(t); }} />}
                {tab === "Data" && <DataTab data={data} onCopy={copy} />}
                {tab === "Details" && <DetailsTab data={data} />}
              </div>
            </div>

            {/* Right column: the caller */}
            <aside className="border-t lg:border-t-0 lg:border-l border-zinc-200/70 bg-zinc-50/40 lg:overflow-y-auto lg:overscroll-contain">
              <div className="px-5 py-5">
                <h3 className="text-[14px] font-semibold text-zinc-900">Contact information</h3>
                <dl className="mt-3 space-y-2.5 text-[13px]">
                  <Row label="Name">{data.analysis?.captured.caller_name || "—"}</Row>
                  <Row label="Phone number"><span className="tabular">{(data.direction === "outbound" ? data.to_number : data.from_number) ?? "—"}</span></Row>
                  <Row label="Callback number"><span className="tabular">{data.analysis?.captured.callback_number || "—"}</span></Row>
                  {data.analysis?.captured.appointment && <Row label="Appointment">{data.analysis.captured.appointment}</Row>}
                  {data.analysis?.followup_required && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                      <span className="font-medium">Follow up:</span> {data.analysis.followup_note || "This caller needs a call back."}
                    </div>
                  )}
                </dl>
                <h3 className="mt-6 text-[14px] font-semibold text-zinc-900">Contact conversations <span className="text-zinc-400 font-normal tabular">({data.contact_calls.length})</span></h3>
                <ul className="mt-2 divide-y divide-zinc-200/70 border-y border-zinc-200/70">
                  {data.contact_calls.map((c) => {
                    const on = c.call_id === data.call_id;
                    return (
                      <li key={c.call_id}>
                        <button type="button" disabled={on} onClick={() => onNavigate(c.call_id)}
                          className={cx("w-full flex items-center gap-2.5 py-2.5 px-1 text-left text-[13px]", on ? "cursor-default" : "hover:bg-zinc-100/70 rounded-md")}>
                          <svg className="h-3.5 w-3.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                          <span className={cx("font-medium", on ? "text-zinc-900" : "text-zinc-800")}>{humanize(c.direction ?? "call")}</span>
                          <span className="text-zinc-500">{fmtDay(c.start_ts, timezone)}</span>
                          <span className="ml-auto tabular text-zinc-500">{fmtDur(c.duration_ms == null ? null : c.duration_ms / 1000)}</span>
                          {on ? <span className="text-[11px] text-zinc-400">This call</span> : <svg className="h-3.5 w-3.5 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m9 18 6-6-6-6" /></svg>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ───────────── Tabs ───────────── */

function Transcript({ data, time, playing, onSeek }: { data: CallDrawerData; time: number; playing: boolean; onSeek: (t: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  let active = -1;
  data.transcript.forEach((l, i) => { if (l.start != null && l.start <= time + 0.05) active = i; });
  useEffect(() => {
    if (!playing || active < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-line="${active}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, playing]);
  if (!data.transcript.length) return <Empty>No transcript for this call. The caller may have hung up before anyone spoke.</Empty>;
  return (
    <div ref={list} className="space-y-3">
      {data.transcript.map((l, i) => {
        const agent = l.role === "agent";
        const on = i === active && (playing || time > 0);
        return (
          <div key={i} data-line={i} className={cx("flex flex-col", agent ? "items-start" : "items-end")}>
            <div className={cx("mb-1 text-[11.5px] text-zinc-500", !agent && "text-right")}>
              {agent ? "Agent" : l.role === "user" ? "User" : humanize(l.role)}
              {l.start != null && (
                <button type="button" onClick={() => onSeek(l.start!)} className="ml-1.5 tabular text-zinc-400 hover:text-zinc-900 hover:underline" aria-label={`Play from ${clock(l.start)}`}>{clock(l.start)}</button>
              )}
            </div>
            <button type="button" onClick={() => l.start != null && onSeek(l.start)}
              className={cx("max-w-[85%] text-left rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed transition-[background-color,box-shadow] duration-150",
                agent ? "bg-zinc-100 text-zinc-900 rounded-tl-md" : "bg-sky-50 text-zinc-900 rounded-tr-md",
                on && "ring-2 ring-zinc-900/80")}>
              {l.content}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AiAnalysis({ data, onSeek }: { data: CallDrawerData; onSeek: (t: number) => void }) {
  const d = data.analysis;
  if (!d) return <Empty>This call hasn&apos;t been analyzed yet. Analysis runs automatically a few minutes after a call ends.</Empty>;
  const SCORE: [keyof typeof d.scorecard, string][] = [
    ["intent_understanding", "Understood the caller"], ["information_accuracy", "Accurate information"], ["flow_efficiency", "Efficient flow"],
    ["tone_and_empathy", "Tone and empathy"], ["task_completion", "Completed the task"], ["instruction_compliance", "Followed instructions"],
  ];
  const Ev = ({ items, good }: { items: CallDiagnosis["what_worked"]; good: boolean }) => (
    <ul className="mt-2 space-y-2">
      {items.map((e, i) => (
        <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-zinc-700">
          <span className={cx("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", good ? "bg-emerald-500" : "bg-rose-500")} aria-hidden />
          <span className="flex-1">{e.point}</span>
          {e.at_s >= 0 && <button type="button" onClick={() => onSeek(e.at_s)} className="h-6 shrink-0 rounded-md border border-zinc-200 px-1.5 text-[11.5px] tabular text-zinc-600 hover:border-zinc-300 hover:text-zinc-900">{clock(e.at_s)}</button>}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <Block label="Caller wanted"><span className="font-medium text-zinc-900">{d.caller_intent}</span></Block>
        <Block label="Did it work?">
          <span className={cx("font-medium", d.success ? "text-emerald-700" : "text-rose-700")}>{d.success ? "Yes" : "No"}</span>
          <span className="text-zinc-600">. {d.success_reason}</span>
        </Block>
      </div>
      {d.what_worked.length > 0 && <div><h4 className="text-[13px] font-semibold text-zinc-900">What worked</h4><Ev items={d.what_worked} good /></div>}
      {d.what_failed.length > 0 && <div><h4 className="text-[13px] font-semibold text-zinc-900">What went wrong</h4><Ev items={d.what_failed} good={false} /></div>}
      {d.root_causes.filter((r) => r !== "none").length > 0 && (
        <div>
          <h4 className="text-[13px] font-semibold text-zinc-900">Root causes</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.root_causes.filter((r) => r !== "none").map((r) => <Chip key={r}>{ROOT_CAUSE_LABEL[r as RootCause] ?? humanize(r)}</Chip>)}
            <Chip>{humanize(d.severity)} severity</Chip>
          </div>
        </div>
      )}
      {d.recommended_fix && d.recommended_fix !== "None needed" && (
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4">
          <h4 className="text-[13px] font-semibold text-zinc-900">Recommended fix</h4>
          <p className="mt-1 text-[13.5px] leading-relaxed text-zinc-700">{d.recommended_fix}</p>
          {d.prompt_change_suggestion && <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white border border-zinc-200/80 p-3 font-mono text-[12px] text-zinc-700">{d.prompt_change_suggestion}</pre>}
        </div>
      )}
      <div>
        <h4 className="text-[13px] font-semibold text-zinc-900">Scorecard</h4>
        <dl className="mt-2 space-y-2">
          {SCORE.map(([k, label]) => (
            <div key={k} className="flex items-center gap-3 text-[13px]">
              <dt className="w-44 shrink-0 text-zinc-600">{label}</dt>
              <dd className="flex flex-1 gap-1" aria-label={`${d.scorecard[k]} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => <span key={n} className={cx("h-1.5 flex-1 rounded-full", n <= d.scorecard[k] ? (d.scorecard[k] >= 4 ? "bg-emerald-500" : d.scorecard[k] >= 3 ? "bg-amber-400" : "bg-rose-500") : "bg-zinc-200")} />)}
              </dd>
              <span className="w-4 text-right tabular text-zinc-900">{d.scorecard[k]}</span>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-[12px] text-zinc-400">Analyzed by {data.analysis_source === "rules" ? "the rule engine" : "Claude Sonnet 5.5"}.</p>
    </div>
  );
}

function DataTab({ data, onCopy }: { data: CallDrawerData; onCopy: (t: string, w: string) => void }) {
  const groups: [string, Record<string, unknown>][] = [
    ["Dynamic variables", data.dynamic_variables],
    ["Collected variables", data.collected_variables],
    ["Post-call extraction", data.custom_analysis],
    ["Metadata", data.metadata],
  ];
  return (
    <div className="space-y-6">
      {groups.map(([title, obj]) => {
        const entries = Object.entries(obj ?? {});
        return (
          <div key={title}>
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-zinc-900">{title}</h4>
              {entries.length > 0 && <button type="button" onClick={() => onCopy(JSON.stringify(obj, null, 2), title)} className="text-[12px] text-zinc-500 hover:text-zinc-900">Copy JSON</button>}
            </div>
            {entries.length === 0 ? <p className="mt-1.5 text-[13px] text-zinc-400">None</p> : (
              <dl className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200/80">
                {entries.map(([k, v]) => (
                  <div key={k} className="flex gap-4 px-3.5 py-2.5 text-[13px]">
                    <dt className="w-40 shrink-0 font-mono text-[12px] text-zinc-500 break-all">{k}</dt>
                    <dd className="flex-1 min-w-0 text-zinc-900 break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailsTab({ data }: { data: CallDrawerData }) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-[13px] font-semibold text-zinc-900">Latency</h4>
        {data.latency.length === 0 ? <p className="mt-1.5 text-[13px] text-zinc-400">No latency data</p> : (
          <table className="mt-2 w-full text-[13px]">
            <thead><tr className="text-left text-[12px] text-zinc-500"><th className="font-medium py-1.5">Component</th><th className="font-medium text-right">p50</th><th className="font-medium text-right">p90</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {data.latency.map((l) => <tr key={l.name}><td className="py-2 text-zinc-700">{l.name}</td><td className="text-right text-zinc-900">{fmtMs(l.p50)}</td><td className="text-right text-zinc-900">{fmtMs(l.p90)}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <h4 className="text-[13px] font-semibold text-zinc-900">Cost</h4>
        <table className="mt-2 w-full text-[13px]">
          <tbody className="divide-y divide-zinc-100">
            {data.cost_breakdown.map((c) => <tr key={c.product}><td className="py-2 text-zinc-700">{humanize(c.product)}</td><td className="text-right text-zinc-900">{fmtMoney(c.cost_cents)}</td></tr>)}
            <tr><td className="py-2 font-medium text-zinc-900">Total</td><td className="text-right font-medium text-zinc-900">{fmtMoney(data.combined_cost_cents)}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <h4 className="text-[13px] font-semibold text-zinc-900">Tool calls</h4>
        {data.tool_events.length === 0 ? <p className="mt-1.5 text-[13px] text-zinc-400">The agent didn&apos;t call any tools.</p> : (
          <ul className="mt-2 space-y-2">
            {data.tool_events.map((t, i) => (
              <li key={i} className={cx("rounded-lg border px-3 py-2 text-[12.5px]", t.ok === false ? "border-rose-200 bg-rose-50/60" : "border-zinc-200/80")}>
                <div className="font-medium text-zinc-900">{t.role === "tool_call_invocation" ? `Called ${t.name ?? "tool"}` : "Result"}</div>
                {t.detail && <div className="mt-0.5 font-mono text-[11.5px] text-zinc-600 break-all">{t.detail}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="space-y-2 text-[13px]">
        {data.transfer_destination && <Row label="Transferred to"><span className="tabular">{data.transfer_destination}</span></Row>}
        <Row label="Voicemail">{data.in_voicemail == null ? "—" : data.in_voicemail ? "Yes" : "No"}</Row>
        {data.public_log_url && <Row label="Retell log"><a href={data.public_log_url} target="_blank" rel="noreferrer" className="text-zinc-900 underline underline-offset-2">Open public log</a></Row>}
      </dl>
    </div>
  );
}

/* ───────────── Small pieces ───────────── */

function DrawerSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4" aria-busy="true" aria-label="Loading call">
      <div className="skeleton h-6 w-64 rounded-md" />
      <div className="skeleton h-4 w-40 rounded-md" />
      <div className="space-y-2 pt-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-4 rounded-md" style={{ width: `${70 - i * 8}%` }} />)}</div>
      <div className="skeleton h-14 w-full rounded-xl" />
      <div className="skeleton h-24 w-full rounded-xl" />
    </div>
  );
}
const Chip = ({ children }: { children: React.ReactNode }) => <span className="inline-flex h-6 items-center rounded-md border border-zinc-200 bg-white px-2 text-[12px] font-medium text-zinc-700">{children}</span>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-8 text-center text-[13.5px] text-zinc-500">{children}</p>;
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-2"><dt className="text-zinc-500">{label}:</dt><dd className="text-zinc-900 inline-flex flex-wrap items-center">{children}</dd></div>;
}
function Fact({ label, dot, children }: { label: string; dot: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">{label}</dt><dd className="flex items-center gap-2 text-zinc-900"><span className={cx("h-2 w-2 rounded-full", dot)} aria-hidden />{children}</dd></div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-zinc-500">{label}</dt><dd className="text-right text-zinc-900 min-w-0 break-words">{children}</dd></div>;
}
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[12px] text-zinc-500">{label}</div><div className="mt-1 text-[13.5px] leading-relaxed">{children}</div></div>;
}
function CopyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Copy" className="ml-1 h-6 w-6 inline-grid place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
    </button>
  );
}
function NavBtn({ label, disabled, onClick, d }: { label: string; disabled: boolean; onClick: () => void; d: string }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="h-8 w-8 grid place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-40">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
    </button>
  );
}

const short = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 6)}…${s.slice(-4)}` : s);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function fmtWhen(iso: string | null, tz: string) {
  if (!iso) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function fmtClock(iso: string | null, tz: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}
function fmtDay(iso: string | null, tz: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}
