import Link from "next/link";
import { topIssues, versionComparison, intentMix, scorecardAverages, reviewQueue, followUps } from "@/lib/insights";
import type { AnalyticsCallFull } from "@/lib/db/queries";
import { ROOT_CAUSE_LABEL, type RootCause } from "@/lib/types";
import type { CallDiagnosis } from "@/lib/ai/schemas";
import Chart from "@/components/charts/Chart";
import { Card, OutcomePill, RootCauseTag, fmtPct, fmtMs, fmtDate, humanize, cx } from "@/components/ui";

const SEV_CLS: Record<string, string> = {
  critical: "bg-rose-100 text-rose-800 border border-rose-200",
  high: "bg-rose-50 text-rose-700 border border-rose-200/70",
  medium: "bg-amber-50 text-amber-800 border border-amber-200/70",
  low: "bg-slate-100 text-slate-700 border border-slate-200",
  none: "bg-emerald-50 text-emerald-700 border border-emerald-200/70",
};

const SCORE_LABEL: Record<string, string> = {
  intent_understanding: "Understood caller",
  information_accuracy: "Accuracy",
  flow_efficiency: "Efficiency",
  tone_and_empathy: "Tone",
  task_completion: "Task completion",
  instruction_compliance: "Followed instructions",
};

/** Cross-call insights body, shared by real workspaces and the demo. */
export default function InsightsView({
  calls,
  prev,
  timezone,
  businessHours,
  link,
  callsHref,
}: {
  calls: AnalyticsCallFull[];
  prev: AnalyticsCallFull[];
  timezone: string;
  businessHours?: Record<string, [number, number]>;
  link: (callId: string) => string;
  callsHref: (extra: string) => string;
}) {
  const issues = topIssues(calls, prev);
  const versions = versionComparison(calls, { timezone, businessHours });
  const intents = intentMix(calls);
  const scores = scorecardAverages(calls);
  const queue = reviewQueue(calls);
  const follow = followUps(calls);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight mb-3">Top issues to fix</h2>
        {issues.length === 0 ? (
          <Card><p className="text-sm text-slate-600">No recurring problems found. 🎉</p></Card>
        ) : (
          <div className="space-y-3">
            {issues.map((it, i) => (
              <details key={it.cause} className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden group transition-all" open={i < 2}>
                <summary className="p-4 flex items-start gap-4 cursor-pointer hover:bg-slate-50/60 transition">
                  <span className="text-xl font-bold text-slate-400 w-7 tabular">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-[15px]">{ROOT_CAUSE_LABEL[it.cause as RootCause] ?? it.cause}</span>
                      {Object.entries(it.severity).filter(([k]) => k !== "none").sort().map(([k, v]) => (
                        <span key={k} className={cx("text-xs font-semibold px-2 py-0.5 rounded-full", SEV_CLS[k])}>{v} {k}</span>
                      ))}
                    </div>
                    <p className="text-[13px] text-slate-600 mt-1">{it.fixes[0]?.text ?? "See example calls."}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-slate-900 tabular">{it.count}</div>
                    <div className="text-xs text-slate-500">{fmtPct(it.share)} of calls</div>
                    {it.prevCount > 0 && (
                      <div className={cx("text-xs font-semibold mt-0.5", it.count > it.prevCount ? "text-rose-600" : "text-emerald-600")}>
                        {it.count > it.prevCount ? "▲" : "▼"} from {it.prevCount}
                      </div>
                    )}
                  </div>
                </summary>
                <div className="px-4 pb-4 pl-[60px] grid lg:grid-cols-2 gap-5 border-t border-slate-100 pt-3 bg-slate-50/40">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recommended fixes</div>
                    <ol className="space-y-2 text-[13px] list-decimal pl-4 text-slate-700">
                      {it.fixes.map((fx, j) => (
                        <li key={j}>
                          {fx.text} {fx.count > 1 && <span className="text-xs text-slate-400">(suggested on {fx.count} calls)</span>}
                        </li>
                      ))}
                    </ol>
                    {it.promptChanges.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2">Prompt changes to try</div>
                        {it.promptChanges.map((p, j) => (
                          <pre key={j} className="whitespace-pre-wrap text-[12px] bg-white border border-slate-200 rounded-lg p-3 mb-2 font-mono text-slate-800 shadow-2xs">{p}</pre>
                        ))}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Example calls</div>
                    <ul className="space-y-2">
                      {it.examples.map((e) => (
                        <li key={e.call_id}>
                          <Link href={link(e.call_id)} className="block border-l-[3px] border-slate-300 hover:border-slate-900 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-r-lg px-3 py-2 text-[12px] leading-relaxed transition shadow-2xs">
                            <span className={cx("text-xs font-semibold px-1.5 py-0.2 rounded mr-1.5", SEV_CLS[e.severity])}>{e.severity}</span>
                            <span className="text-slate-800">{e.summary.slice(0, 220)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link href={callsHref(`root_cause=${it.cause}`)} className="inline-block mt-2.5 text-xs font-semibold text-slate-900 hover:underline">
                      All {it.count} calls →
                    </Link>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Quality scorecard" sub="Average AI score per dimension (1–5)">
          <Chart kind="bar" ariaLabel="Scorecard averages" categories={scores.map((x) => SCORE_LABEL[x.key])} series={[{ name: "Average", data: scores.map((x) => x.avg === null ? null : Math.round(x.avg * 10) / 10), color: "--s1" }]} height={240} />
        </Card>
        <Card title="What callers want · and how well it goes" sub="Intent category from AI diagnosis">
          {intents.length ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-left border-b border-slate-200">
                  <th className="py-2">Intent</th>
                  <th className="text-right">Calls</th>
                  <th className="text-right">Success</th>
                  <th className="text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {intents.slice(0, 10).map((r) => (
                  <tr key={r.intent} className="hover:bg-slate-50/70 transition">
                    <td className="py-2 font-medium text-slate-800">{humanize(r.intent)}</td>
                    <td className="text-right text-slate-600">{r.calls}</td>
                    <td className={cx("text-right font-semibold", r.successRate < 0.6 ? "text-rose-600" : "text-emerald-700")}>
                      {fmtPct(r.successRate)}
                    </td>
                    <td className="text-right font-medium text-slate-700">{r.avgScore == null ? "—" : Math.round(r.avgScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">No data.</p>
          )}
        </Card>
      </div>

      <Card title="Agent version comparison" sub="Did the last prompt change help? Each row is one published version.">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead>
              <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-left border-b border-slate-200">
                <th className="py-2.5">Agent · version</th>
                <th>First call</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Success</th>
                <th className="text-right">Transfer success</th>
                <th className="text-right">Silent hangups</th>
                <th className="text-right">Latency p50</th>
                <th className="text-right">Interruptions</th>
                <th className="text-right">AI score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {versions.map((v) => (
                <tr key={`${v.agent}${v.version}`} className="hover:bg-slate-50/70 transition">
                  <td className="py-2.5 font-semibold text-slate-900">
                    {v.agent} <span className="text-slate-400 font-normal">v{v.version}</span>
                  </td>
                  <td className="text-xs text-slate-500">{fmtDate(v.first, timezone, false)}</td>
                  <td className="text-right text-slate-700">{v.calls}</td>
                  <td className="text-right font-semibold text-slate-900">{fmtPct(v.s.success_rate)}</td>
                  <td className="text-right text-slate-700">{fmtPct(v.s.transfer_success_rate)}</td>
                  <td className="text-right text-slate-700">{fmtPct(v.s.silent_hangups / Math.max(1, v.calls))}</td>
                  <td className="text-right text-slate-700">{fmtMs(v.s.e2e_latency_ms.median)}</td>
                  <td className="text-right text-slate-700">{v.s.conversation.avg_interruptions?.toFixed(1) ?? "—"}</td>
                  <td className="text-right font-semibold text-slate-900">{v.s.avg_score == null ? "—" : Math.round(v.s.avg_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Calls to review" sub="Low scores, high severity, failed transfers or negative mood">
          {queue.length ? (
            <ul className="divide-y divide-slate-100">
              {queue.map((c) => (
                <li key={c.call_id}>
                  <Link href={link(c.call_id)} className="flex items-start gap-3 py-3 hover:bg-slate-50/80 rounded-lg px-2 -mx-2 transition">
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <OutcomePill outcome={c.outcome} />
                        <RootCauseTag cause={c.primary_root_cause} />
                      </div>
                      <div className="text-[12px] mt-1.5 text-slate-700 line-clamp-2 leading-relaxed">
                        {(c.analysis as unknown as CallDiagnosis)?.plain_english_summary}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cx("font-bold text-sm", (c.overall_score ?? 100) < 50 ? "text-rose-600" : "text-slate-900")}>
                        {c.overall_score ?? "—"}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{fmtDate(c.start_ts, timezone)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nothing needs review.</p>
          )}
        </Card>

        <Card title="Follow-ups for your team" sub="Callers the AI says a human should contact">
          {follow.length ? (
            <ul className="divide-y divide-slate-100">
              {follow.map((c) => {
                const d = c.analysis as unknown as CallDiagnosis;
                return (
                  <li key={c.call_id}>
                    <Link href={link(c.call_id)} className="block py-3 hover:bg-slate-50/80 rounded-lg px-2 -mx-2 transition">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-[13px] text-slate-900">{d.captured?.caller_name || "Unknown caller"}</span>
                        <span className="text-xs font-mono text-slate-500">{d.captured?.callback_number || c.from_number}</span>
                      </div>
                      <div className="text-[12px] text-slate-600 mt-1 leading-relaxed">{d.followup_note}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No follow-ups needed.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
