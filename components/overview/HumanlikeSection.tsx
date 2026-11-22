import Link from "next/link";
import Chart from "@/components/charts/Chart";
import { Card, Kpi, KpiGrid, cx } from "@/components/ui";
import type { HumanlikeSummary } from "@/lib/humanlike/summary";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const SUB: [keyof HumanlikeSummary["sub"], string][] = [["voice", "Voice"], ["timing", "Timing"], ["flow", "Flow"], ["listening", "Listening"], ["accuracy", "Accuracy"]];
const bar = (v: number) => (v >= 85 ? "bg-emerald-500" : v >= 70 ? "bg-zinc-800" : v >= 50 ? "bg-amber-500" : "bg-rose-500");

/** Analytics section: how human the agent sounds across the period, and where it doesn't. */
export default function HumanlikeSection({ s, callHref, live }: { s: HumanlikeSummary; callHref: (callId: string) => string; live: boolean }) {
  return (
    <section aria-labelledby="humanlike" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t border-zinc-200/80 pt-8">
        <div>
          <h2 id="humanlike" className="section-title">How human your agent sounds</h2>
          <p className="text-[13px] text-zinc-500 mt-1">
            Measured from each call&apos;s audio (pitch, pace, pauses, response time) and reviewed by AI for robotic phrasing and mistakes.
            {s.sample && " Sample data: the demo calls have no real recordings."}
          </p>
        </div>
        {s.pending > 0 && live && <span className="text-[12.5px] text-zinc-500" role="status">Analyzing {s.pending} more call{s.pending === 1 ? "" : "s"} in the background…</span>}
      </div>

      {s.analyzed === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            {live ? "No calls analyzed yet in this period. New calls are analyzed automatically; older ones are being caught up in the background." : "No calls in this period could be judged (they were too short or silent)."}
          </p>
        </Card>
      ) : (
        <>
          <KpiGrid cols={4}>
            <Kpi label="Human-likeness" value={s.avg ?? "—"} unit="/100" sub={s.label ?? ""} />
            <Kpi label="Calls analyzed" value={s.analyzed} sub={s.skipped ? `${s.skipped} too short to judge` : "in this period"} />
            <Kpi label="Robotic moments" value={s.roboticPerCall ?? "—"} sub="per call" />
            <Kpi label="Mistakes" value={s.mistakesPerCall ?? "—"} sub="per call" tone={(s.mistakesPerCall ?? 0) >= 1 ? "bad" : undefined} />
          </KpiGrid>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="Where it sounds human, and where it doesn't" sub="Average of every analyzed call (0–100)">
              <dl className="space-y-3">
                {SUB.map(([k, label]) => {
                  const v = s.sub[k];
                  return (
                    <div key={k} className="grid grid-cols-[84px_1fr_32px] items-center gap-3 text-[13px]">
                      <dt className="text-zinc-600">{label}</dt>
                      <dd className="h-2 rounded-full bg-zinc-100 overflow-hidden">{v != null && <div className={cx("h-full rounded-full", bar(v))} style={{ width: `${v}%` }} />}</dd>
                      <span className="text-right tabular text-zinc-900">{v ?? "—"}</span>
                    </div>
                  );
                })}
              </dl>
              {s.topFixes.length > 0 && (
                <div className="mt-5 rounded-lg bg-zinc-50 border border-zinc-200/70 p-3.5">
                  <div className="text-[12.5px] font-medium text-zinc-900">Most valuable fixes</div>
                  <ol className="mt-1.5 list-decimal pl-5 space-y-1 text-[13px] text-zinc-700">{s.topFixes.map((f) => <li key={f.fix}>{f.fix}</li>)}</ol>
                </div>
              )}
            </Card>
            <Card title="Human-likeness over time" sub="Average score per period">
              <Chart kind="line" ariaLabel="Human-likeness score over time" categories={s.trend.x} series={[{ name: "Human-likeness", data: s.trend.y, color: "--s3" }]} />
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="What makes it sound robotic" sub="Robotic moments and mistakes, by type">
              {s.patterns.length ? (
                <Chart kind="bar" ariaLabel="Robotic patterns" categories={s.patterns.map((p) => p.label)} series={[{ name: "Moments", data: s.patterns.map((p) => p.count), color: "--s4" }]} height={Math.max(180, s.patterns.length * 32)} />
              ) : <p className="text-sm text-zinc-500">No robotic moments found.</p>}
            </Card>
            <Card title="Worst moments to listen to" sub="From the lowest-scoring calls. Open one to hear it.">
              <ul className="divide-y divide-zinc-100">
                {s.worst.map((w) => (
                  <li key={w.call_id}>
                    <Link href={callHref(w.call_id)} className="flex items-start gap-3 py-2.5 hover:bg-zinc-50 -mx-2 px-2 rounded-lg">
                      <span className={cx("mt-1 h-2 w-2 shrink-0 rounded-full", w.moment.kind === "mistake" ? "bg-rose-500" : "bg-amber-500")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] text-zinc-900">{w.moment.what}</span>
                        <span className="block text-[12px] text-zinc-500 tabular">At {clock(w.moment.at_s)} · call score {w.score}</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {!s.worst.length && <li className="py-2 text-sm text-zinc-500">Nothing to review.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
