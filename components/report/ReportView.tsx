import type { ReportSnapshot } from "@/lib/reports/snapshot";
import type { ReportNarrative } from "@/lib/ai/schemas";
import { OUTCOME_LABEL, ROOT_CAUSE_LABEL, type Outcome, type RootCause } from "@/lib/types";
import { OUTCOME_COLOR, OUTCOME_ORDER, SENTIMENT_COLOR } from "@/lib/colors";
import Chart from "../charts/Chart";
import ReportCallTable from "./ReportCallTable";
import { fmtDur, fmtMs, fmtPct, humanize, cx } from "../ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function periodLabel(from: string, to: string, tz: string) {
  const f = (d: string, y = false) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}) }).format(new Date(d));
  return `${f(from)} to ${f(to, true)}`;
}

/** The client-facing report, modeled on the Open Water Marine report layout. */
export default function ReportView({ snap, narrative, print }: { snap: ReportSnapshot; narrative: ReportNarrative | null; print?: boolean }) {
  const s = snap.summary;
  const tz = snap.workspace.timezone;
  const agent = snap.workspace.agent_name ?? "";
  const monthTag = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", year: "numeric" }).format(new Date(snap.period.to));
  const outcomeKeys = OUTCOME_ORDER.filter((k) => s.by_outcome[k]);
  const sentimentKeys = ["Positive", "Neutral", "Negative", "Unknown"].filter((k) => s.by_sentiment[k]);
  const disc = Object.entries(s.by_disconnection).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const durKeys = OUTCOME_ORDER.filter((k) => s.duration_by_outcome[k] != null);
  const transfersOk = snap.calls.filter((c) => c.outcome === "transfer_ok");
  const transfersFail = snap.calls.filter((c) => c.outcome === "transfer_fail");
  const longest = Math.max(0, ...snap.calls.map((c) => c.dur_s ?? 0));

  return (
    <div className="report-root max-w-[1200px] mx-auto px-4 sm:px-6 py-8 bg-surface text-ink" style={{ ["--brand" as string]: snap.workspace.brand_primary }}>
      {/* HERO */}
      <header className="border-b-2 border-ink pb-7 mb-7">
        {snap.workspace.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snap.workspace.logo_url} alt={snap.workspace.name} className="h-12 sm:h-14 w-auto mb-5" />
        )}
        <div className="inline-block bg-brand text-black font-mono text-[11px] font-bold tracking-widest uppercase px-2.5 py-1 mb-4">{snap.workspace.name} · {monthTag} Report</div>
        <h1 className="text-3xl sm:text-[42px] font-extrabold tracking-tight leading-[1.1]">Your AI Voice Agent<br />Handled <span className="accent-mark">{s.total} Calls</span></h1>
        <p className="text-dim mt-4 max-w-2xl text-[15px] leading-relaxed">A plain-English report on how your AI receptionist performed: how many customers were booked, transferred to your team, or had their contact info saved for follow-up, and where the agent can do better.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mt-6 pt-5 border-t border-line">
          {[["Reporting period", periodLabel(snap.period.from, snap.period.to, tz)], ["Total calls", String(s.total)], ["Unique callers", String(s.unique_callers)], ["Agent name", agent ? `${agent} (AI)` : "AI agent"]].map(([k, v]) => (
            <div key={k}><div className="eyebrow !text-muted">{k}</div><div className="font-semibold mt-1">{v}</div></div>
          ))}
        </div>
      </header>

      {/* EXEC SUMMARY */}
      {narrative && (
        <section className="mb-7">
          <div className="bg-brand text-black px-6 py-5">
            <span className="block font-mono text-[11px] font-bold uppercase tracking-widest text-[#713f12] mb-2">★ Quick summary</span>
            <p className="text-[17px] font-bold leading-snug">{narrative.headline}</p>
          </div>
          <div className="grid md:grid-cols-2 border border-brand border-t-0">
            <div className="p-6 md:border-r border-line border-b md:border-b-0">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-good mb-3">✓ What worked well</div>
              {narrative.what_worked.map((w, i) => <Line key={i} icon="✓" tone="good">{w}</Line>)}
            </div>
            <div className="p-6">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-bad mb-3">▲ What needs fixing</div>
              {narrative.what_needs_fixing.map((w, i) => <Line key={i} icon="!" tone="bad">{w}</Line>)}
            </div>
          </div>
          <div className="bg-[#0b0b0b] text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm">{narrative.bottom_line}</p>
            <div className="font-mono text-xs uppercase tracking-wider text-muted shrink-0">Success rate<span className="block text-3xl font-sans font-extrabold text-brand tracking-tight">{fmtPct(s.success_rate)}</span></div>
          </div>
        </section>
      )}

      {/* KPIs */}
      <Section title="Key numbers">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-line border border-line">
          <K label="Calls answered" value={s.total} sub={`${s.customer_calls} real customers`} />
          <K label="Appointments booked" value={s.by_outcome.booked ?? 0} sub="added to calendar" hi />
          <K label="Connected to team" value={<>{s.transfer_ok}<span className="text-lg text-dim font-medium"> / {s.transfer_attempts}</span></>} sub={`${fmtPct(s.transfer_success_rate, 1)} success`} hi />
          <K label="Leads captured" value={s.by_outcome.lead_captured ?? 0} sub="contact info saved" />
          <K label="Silent hangups" value={s.silent_hangups} sub="dropped without speaking" warn={s.silent_hangups > 0} />
          <K label="Total talk time" value={<>{s.total_talk_min.toFixed(1)}<span className="text-base text-dim font-semibold ml-1">min</span></>} sub="agent on the phone" hi />
        </div>
      </Section>

      <section className="bg-[#0b0b0b] text-white p-7 flex flex-col sm:flex-row justify-between gap-6 mb-7">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-brand mb-1.5">Total time your AI agent was on calls</div>
          <div className="text-5xl font-extrabold tracking-tight">{s.total_talk_min.toFixed(1)}<span className="text-xl text-muted font-medium ml-1">minutes</span></div>
        </div>
        <div className="sm:text-right space-y-3">
          <div><div className="eyebrow !text-muted">Average per call</div><div className="text-xl font-bold text-brand">{fmtDur(s.duration_s.avg)}</div></div>
          <div><div className="eyebrow !text-muted">Longest single call</div><div className="text-xl font-bold text-brand">{fmtDur(longest)}</div></div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5 mb-7">
        <Box title="What happened on each call">
          <Chart kind="donut" ariaLabel="Outcomes" categories={outcomeKeys.map((k) => OUTCOME_LABEL[k as Outcome] ?? "Not analyzed")} series={[{ name: "Calls", data: outcomeKeys.map((k) => s.by_outcome[k]) }]} sliceColors={outcomeKeys.map((k) => OUTCOME_COLOR[k])} />
          {narrative && <Note>{narrative.chart_insights.outcomes}</Note>}
        </Box>
        <Box title="Hand-offs to your team" sub={`${s.transfer_attempts} times the AI tried to pass a caller to a human`}>
          <div className="grid grid-cols-2 gap-px bg-line border border-line mb-4">
            <div className="bg-brand-wash p-5 text-center"><div className="text-5xl font-extrabold">{s.transfer_ok}</div><div className="font-mono text-xs text-dim mt-1">{fmtPct(s.transfer_success_rate, 1)}</div><div className="eyebrow mt-1">Connected</div></div>
            <div className="bg-surface p-5 text-center"><div className="text-5xl font-extrabold text-bad">{s.transfer_attempts - s.transfer_ok}</div><div className="font-mono text-xs text-dim mt-1">{fmtPct(s.transfer_success_rate == null ? null : 1 - s.transfer_success_rate, 1)}</div><div className="eyebrow mt-1">Failed</div></div>
          </div>
          {transfersFail.length > 0 && (
            <>
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-bad mb-2">▲ Why they failed</div>
              <div className="space-y-1.5">{transfersFail.map((c) => (
                <div key={c.n} className="bg-bad-bg border-l-[3px] border-bad px-4 py-3 text-[12px]">
                  <b>#{c.n} · {c.caller}</b>
                  <div className="text-bad mt-1">▲ {c.what_failed[0] ?? c.summary}</div>
                </div>
              ))}</div>
            </>
          )}
          {narrative && <Note>{narrative.chart_insights.transfers}</Note>}
        </Box>
      </div>

      {transfersOk.length > 0 && (
        <Box title={`All ${transfersOk.length} successful hand-offs`} sub="Callers the AI correctly passed to a human" className="mb-7">
          <div className="grid md:grid-cols-2 gap-1.5">{transfersOk.map((c) => (
            <div key={c.n} className="bg-surface-2 border-l-[3px] border-brand px-4 py-3 text-[12px] flex justify-between gap-3">
              <div><b>#{c.n} · {c.caller}</b>{/emergenc|sinking|stuck|stranded/i.test(c.reason) && <span className="ml-1.5 bg-bad text-white text-[9px] font-mono font-bold uppercase px-1.5">Emergency</span>}<div className="text-dim mt-1">{c.reason}</div></div>
              <span className="font-mono text-dim font-bold shrink-0">{fmtDur(c.dur_s)}</span>
            </div>
          ))}</div>
        </Box>
      )}

      <div className="grid lg:grid-cols-2 gap-5 mb-7">
        <Box title="How callers felt">
          <Chart kind="donut" ariaLabel="Sentiment" categories={sentimentKeys} series={[{ name: "Calls", data: sentimentKeys.map((k) => s.by_sentiment[k]) }]} sliceColors={sentimentKeys.map((k) => SENTIMENT_COLOR[k])} />
          {narrative && <Note>{narrative.chart_insights.sentiment}</Note>}
        </Box>
        <Box title="How calls ended">
          <Chart kind="bar" ariaLabel="How calls ended" categories={disc.map(([k]) => humanize(k))} series={[{ name: "Calls", data: disc.map(([, v]) => v) }]} height={Math.max(160, disc.length * 32)} />
          {narrative && <Note>{narrative.chart_insights.disconnections}</Note>}
        </Box>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-7">
        <Box title="When calls come in (by day)">
          <Chart kind="column" ariaLabel="Calls by day" categories={DOW} series={[{ name: "Calls", data: s.by_dow }]} />
          {narrative && <Note>{narrative.chart_insights.by_day}</Note>}
        </Box>
        <Box title="When calls come in (by hour)" sub={tz}>
          <Chart kind="column" labels="none" ariaLabel="Calls by hour" categories={s.by_hour.map((_, h) => String(h).padStart(2, "0"))} series={[{ name: "Calls", data: s.by_hour }]} />
          {narrative && <Note>{narrative.chart_insights.by_hour}</Note>}
        </Box>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-7">
        <Box title="How long each type of call takes">
          <Chart kind="bar" unit="s" ariaLabel="Duration by outcome" categories={durKeys.map((k) => OUTCOME_LABEL[k as Outcome] ?? k)} series={[{ name: "Avg duration", data: durKeys.map((k) => s.duration_by_outcome[k]) }]} height={Math.max(160, durKeys.length * 32)} />
          {narrative && <Note>{narrative.chart_insights.duration}</Note>}
        </Box>
        <Box title="Conversation quality" sub="Measured from the call audio and word timings">
          <dl className="grid grid-cols-2 gap-px bg-line border border-line text-sm">
            {[
              ["Median response time", fmtMs(s.e2e_latency_ms.median)],
              ["Slowest 10% of responses", fmtMs(s.e2e_p90_latency_ms.p90)],
              ["Caller interruptions per call", s.conversation.avg_interruptions?.toFixed(1) ?? "—"],
              ["Time before greeting", s.conversation.avg_time_to_first_word_s == null ? "—" : `${s.conversation.avg_time_to_first_word_s.toFixed(1)}s`],
              ["Calls where the AI repeated itself", String(s.conversation.calls_with_repetition)],
              ["After-hours calls covered", String(s.after_hours_calls)],
            ].map(([k, v]) => <div key={k} className="bg-surface p-3"><dt className="eyebrow !text-[9px]">{k}</dt><dd className="text-xl font-extrabold mt-1">{v}</dd></div>)}
          </dl>
          {narrative && <Note>{narrative.chart_insights.conversation_quality}</Note>}
        </Box>
      </div>

      {(narrative?.recommended_actions.length || snap.issues.length) ? (
        <Box title="What we'll improve next" className="mb-7">
          {narrative && (
            <ol className="space-y-3 mb-5">{narrative.recommended_actions.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-7 h-7 shrink-0 grid place-items-center bg-brand text-black font-extrabold text-sm">{i + 1}</span>
                <div className="text-[13px] leading-relaxed"><b>{a.action}</b><div className="text-dim">{a.why}</div><div className="text-good text-[12px] mt-0.5">Expected impact: {a.expected_impact}</div></div>
              </li>
            ))}</ol>
          )}
          {snap.issues.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-[12px]">
              <thead><tr className="eyebrow text-left border-b-2 border-ink"><th className="py-2">Issue</th><th className="text-right">Calls</th><th className="pl-4">Example calls</th></tr></thead>
              <tbody>{snap.issues.map((it) => (
                <tr key={it.cause} className="border-b border-line"><td className="py-2 font-semibold">{ROOT_CAUSE_LABEL[it.cause as RootCause] ?? it.cause}</td><td className="text-right font-mono">{it.count}</td><td className="pl-4 font-mono text-dim">{it.examples.map((n) => `#${n}`).join(", ")}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Box>
      ) : null}

      <Box title={print ? "Every call" : "Every call (tap to see the transcript)"} sub={print ? undefined : "Tap any row for the AI's findings and the full conversation."}>
        <ReportCallTable calls={snap.calls} timezone={tz} agentName={agent} print={print} />
      </Box>

      <footer className="mt-8 pt-5 border-t border-line text-[11px] font-mono text-muted flex justify-between flex-wrap gap-2">
        <span>Generated {new Date(snap.generated_at).toLocaleString("en-US", { timeZone: tz })}</span>
        <span>Calls analyzed with AI. Numbers computed directly from call records.</span>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-7"><h2 className="section-title mb-4">{title}</h2>{children}</section>;
}
function Box({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("border border-line p-6 break-inside-avoid min-w-0", className)}>
      <h2 className="section-title mb-1">{title}</h2>
      {sub && <p className="text-xs font-mono text-muted mb-4">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 bg-brand-wash border-l-[3px] border-brand px-4 py-3 text-[13px] leading-relaxed">{children}</div>;
}
function Line({ icon, tone, children }: { icon: string; tone: "good" | "bad"; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start mb-3 text-sm leading-relaxed">
      <span className={cx("w-[22px] h-[22px] shrink-0 grid place-items-center rounded text-white text-xs font-bold font-mono mt-0.5", tone === "good" ? "bg-[var(--status-good)]" : "bg-bad")}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}
function K({ label, value, sub, hi, warn }: { label: string; value: React.ReactNode; sub: string; hi?: boolean; warn?: boolean }) {
  return (
    <div className={cx("relative p-5", hi ? "bg-brand-wash" : "bg-surface")}>
      {(hi || warn) && <div className={cx("absolute inset-x-0 top-0 h-[3px]", warn ? "bg-bad" : "bg-brand")} />}
      <div className="eyebrow">{label}</div>
      <div className={cx("text-4xl font-extrabold tracking-tight mt-2.5 leading-none", warn && "text-bad")}>{value}</div>
      <div className="text-[11px] font-mono text-dim mt-2.5">{sub}</div>
    </div>
  );
}
