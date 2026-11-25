import Link from "next/link";
import type { DigestRun } from "@/lib/automation/types";
import { Card, Kpi, KpiGrid, cx } from "@/components/ui";
import CopyText from "./CopyText";

const HEALTH = {
  good: { label: "Good", cls: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
  watch: { label: "Worth a look", cls: "bg-amber-50 text-amber-800 border-amber-200/80" },
  needs_attention: { label: "Needs attention", cls: "bg-rose-50 text-rose-700 border-rose-200/80" },
} as const;
const SEV = { high: "bg-rose-50 text-rose-700 border-rose-200/80", medium: "bg-amber-50 text-amber-800 border-amber-200/80", low: "bg-zinc-100 text-zinc-600 border-zinc-200" } as const;
const CHANGE: Record<string, string> = { prompt: "Prompt", voice_setting: "Voice setting", knowledge_base: "Knowledge base", tool_or_integration: "Tool or integration", business_process: "Business process" };

const fmt = (iso: string, tz: string, time = true) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) }).format(new Date(iso));

/** Links to the calls a finding is based on (opens the call with its quality tab). */
function CallLinks({ ids, run, tz }: { ids: string[]; run: DigestRun; tz: string }) {
  if (!ids.length) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const ref = run.callRefs?.[id];
        return (
          <Link key={id} href={`/demo/calls?call=${encodeURIComponent(id)}&tab=quality`}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] text-zinc-700 hover:border-zinc-300 hover:text-zinc-900">
            <span className="tabular">{ref?.start_ts ? fmt(ref.start_ts, tz) : id.slice(0, 14)}</span>
            {ref?.score != null && <span className={cx("tabular font-medium", ref.score < 70 ? "text-rose-600" : ref.score < 85 ? "text-amber-700" : "text-emerald-700")}>{ref.score}</span>}
            <span className="text-zinc-300" aria-hidden>→</span>
          </Link>
        );
      })}
    </span>
  );
}

export default function DigestView({ run, tz }: { run: DigestRun; tz: string }) {
  const n = run.narrative!;
  const s = run.stats!;
  const h = HEALTH[n.health];
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200/80 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-500">
          <span className={cx("rounded-full border px-2 py-0.5 text-[11.5px] font-medium", h.cls)}>{h.label}</span>
          <span>{run.frequency === "daily" ? "Daily" : "Weekly"} analysis · {run.wsName}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{fmt(run.period.from, tz, false)} – {fmt(run.period.to, tz, false)}</span>
          {run.sample && <span className="rounded bg-zinc-100 px-1 py-px text-[10.5px] font-medium">Sample</span>}
        </div>
        <p className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-zinc-900 text-pretty">{n.headline}</p>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-zinc-600 text-pretty">{n.summary}</p>
        {run.note && <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[12.5px] text-amber-900">{run.note}</p>}
      </div>

      <KpiGrid cols={6}>
        <Kpi label="Calls" value={s.calls} sub={`${s.conversations} conversations`} />
        <Kpi label="Avg quality" value={s.avgScore ?? "—"} unit={s.avgScore != null ? "/100" : undefined} sub={`${s.analyzed} analyzed`} />
        <Kpi label={`Below ${s.threshold}`} value={s.belowThreshold} tone={s.belowThreshold ? "bad" : undefined} />
        <Kpi label="Failed transfers" value={s.transferFails} tone={s.transferFails ? "bad" : undefined} />
        <Kpi label="Upset callers" value={s.negative} tone={s.negative ? "bad" : undefined} />
        <Kpi label="Errors / unsuccessful" value={`${s.errors} / ${s.unsuccessful}`} />
      </KpiGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        <div className="space-y-6 min-w-0">
          <Card title="Suggested improvements" sub="Most valuable first. Copy a change straight into Retell.">
            {n.improvements.length ? (
              <ol className="space-y-5">
                {n.improvements.map((imp, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-[12px] font-semibold tabular text-white" aria-hidden>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-zinc-900">{imp.title} <span className="ml-1 rounded border border-zinc-200 px-1.5 py-px align-middle text-[11px] font-medium text-zinc-500">{CHANGE[imp.change_type] ?? imp.change_type}</span></p>
                      <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{imp.why}</p>
                      <CopyText text={imp.exact_change} block />
                      <p className="mt-1.5 text-[12.5px] text-zinc-500"><span className="font-medium text-emerald-700">Expected: </span>{imp.expected_impact}</p>
                      <CallLinks ids={imp.example_call_ids} run={run} tz={tz} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-[13px] text-zinc-500">No changes suggested for this period.</p>}
          </Card>

          <Card title="Problems found" sub="Recurring issues across calls, most damaging first.">
            {n.problems.length ? (
              <ul className="space-y-4">
                {n.problems.map((p, i) => (
                  <li key={i}>
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-zinc-900">
                      {p.title}
                      <span className={cx("rounded-full border px-2 py-px text-[11px] font-medium", SEV[p.severity])}>{p.severity}</span>
                      <span className="text-[12px] font-normal text-zinc-500 tabular">{p.how_often}</span>
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{p.detail}</p>
                    <CallLinks ids={p.example_call_ids} run={run} tz={tz} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-zinc-500">No recurring problems.</p>}
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card title="Calls to listen to">
            {n.calls_to_review.length ? (
              <ul className="divide-y divide-zinc-100 -my-2">
                {n.calls_to_review.map((c) => {
                  const ref = run.callRefs?.[c.call_id];
                  return (
                    <li key={c.call_id}>
                      <Link href={`/demo/calls?call=${encodeURIComponent(c.call_id)}&tab=quality`} className="flex gap-3 rounded-lg -mx-2 px-2 py-2.5 hover:bg-zinc-50">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-zinc-900 tabular">{ref?.start_ts ? fmt(ref.start_ts, tz) : c.call_id}</span>
                          <span className="block text-[12.5px] leading-snug text-zinc-500">{c.reason}</span>
                        </span>
                        {ref?.score != null && <span className="self-center text-[13px] font-semibold tabular text-zinc-700">{ref.score}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[13px] text-zinc-500">Nothing stood out.</p>}
          </Card>
          {n.what_went_well.length > 0 && (
            <Card title="What went well">
              <ul className="space-y-2">
                {n.what_went_well.map((w, i) => <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-zinc-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />{w}</li>)}
              </ul>
            </Card>
          )}
          <Card title="How this was made">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-zinc-500">Calls reviewed</dt><dd className="text-zinc-800 tabular">{s.calls} ({s.transcripts} transcripts read)</dd>
              <dt className="text-zinc-500">Audio listened to</dt><dd className="text-zinc-800 tabular">{s.listened ? `${s.listened} calls${s.avgMos != null ? `, naturalness ${s.avgMos}/5` : ""}` : "None"}</dd>
              {s.notAnalyzed > 0 && <><dt className="text-zinc-500">Not analyzed yet</dt><dd className="text-zinc-800 tabular">{s.notAnalyzed} calls</dd></>}
              <dt className="text-zinc-500">Written by</dt><dd className="text-zinc-800">{run.source === "claude" ? "Claude Opus 5.5" : "Rules (no Claude key)"}</dd>
              {run.usage && <><dt className="text-zinc-500">Cost</dt><dd className="text-zinc-800 tabular">${run.usage.cost_usd.toFixed(2)} ({Math.round(run.usage.input_tokens / 1000)}k in / {Math.round(run.usage.output_tokens / 1000)}k out)</dd></>}
              <dt className="text-zinc-500">Finished</dt><dd className="text-zinc-800 tabular">{run.finished_at ? fmt(run.finished_at, tz) : "—"}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
