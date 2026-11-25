import Link from "next/link";
import { getSource } from "@/lib/source";
import { getAutomationSettings, lastWebhookAt } from "@/lib/automation/settings";
import { listRuns } from "@/lib/automation/digest";
import { sampleRun } from "@/lib/automation/sample";
import { scheduleLabel } from "@/lib/automation/schedule";
import { estimateCostUsd } from "@/lib/automation/prompt";
import { selfOrigin } from "@/lib/automation/dispatch";
import { defaultSettings, WEEKDAYS, type DigestRun } from "@/lib/automation/types";
import { listenAvailable } from "@/lib/humanlike/listen";
import { hasServerStore } from "@/lib/live/store";
import { appOrigin } from "@/lib/origin";
import { AlertsForm, RunNow, ScheduleForm } from "@/components/automation/AutomationForms";
import CopyText from "@/components/automation/CopyText";
import { Card, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // "Run now" finishes in the background of this request

const HEALTH: Record<string, { label: string; cls: string }> = {
  good: { label: "Good", cls: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
  watch: { label: "Worth a look", cls: "bg-amber-50 text-amber-800 border-amber-200/80" },
  needs_attention: { label: "Needs attention", cls: "bg-rose-50 text-rose-700 border-rose-200/80" },
};

function fmt(iso: string, tz: string, withTime = true) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) }).format(new Date(iso));
}

function Check({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")} aria-hidden>
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d={ok ? "M20 6 9 17l-5-5" : "M12 8v5m0 3h.01"} /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-zinc-900">{title} <span className="sr-only">{ok ? "(done)" : "(to do)"}</span></p>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500">{children}</div>
      </div>
    </li>
  );
}

function RunsList({ runs, tz }: { runs: DigestRun[]; tz: string }) {
  if (!runs.length) return <p className="text-[13px] text-zinc-500">No runs yet. Turn on the schedule or use Run now.</p>;
  return (
    <ul className="divide-y divide-zinc-100 -my-2">
      {runs.map((r) => {
        const h = r.narrative ? HEALTH[r.narrative.health] : null;
        const body = (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-zinc-900">
                {r.frequency === "daily" ? "Daily" : "Weekly"} analysis · {fmt(r.period.from, tz, false)} – {fmt(r.period.to, tz, false)}
                {r.sample && <span className="ml-2 rounded bg-zinc-100 px-1 py-px text-[10.5px] font-medium text-zinc-500 align-middle">Sample</span>}
              </span>
              <span className="block text-[12px] text-zinc-500">
                {r.trigger === "manual" ? "Run now" : "Scheduled"} · {fmt(r.started_at, tz)}
                {r.stats ? ` · ${r.stats.calls} calls` : ""}{r.usage ? ` · $${r.usage.cost_usd.toFixed(2)}` : ""}
                {r.source === "rules" ? " · without Claude" : ""}
              </span>
              {r.status === "failed" && <span className="block text-[12px] text-rose-600">Failed: {r.error}</span>}
              {r.status === "skipped" && <span className="block text-[12px] text-zinc-500">{r.note}</span>}
            </span>
            {r.status === "running" && <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11.5px] font-medium text-zinc-600 motion-safe:animate-pulse">Running…</span>}
            {h && <span className={cx("rounded-full border px-2 py-0.5 text-[11.5px] font-medium", h.cls)}>{h.label}</span>}
            {r.status === "done" && <span className="text-zinc-300" aria-hidden>→</span>}
          </span>
        );
        return <li key={r.id}>{r.status === "done" ? <Link href={`/demo/automation/runs/${r.id}`} className="block rounded-lg -mx-2 px-2 hover:bg-zinc-50">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

export default async function AutomationPage() {
  const src = await getSource();
  const ws = src.conn;
  const tz = src.timezone;
  const settings = ws ? await getAutomationSettings(ws.id) : defaultSettings();
  const runs = ws ? await listRuns(ws.id, 20) : [sampleRun()];
  const aiReady = !!process.env.ANTHROPIC_API_KEY;
  const cronReady = (process.env.CRON_SECRET ?? "").length >= 16;
  const listenReady = listenAvailable();
  let week = 0;
  if (ws) { try { week = (await src.calls(new Date(Date.now() - 7 * 86400_000).toISOString(), new Date().toISOString())).length; } catch { /* Retell unreachable: estimate from 0 */ } }
  const costWeekly = estimateCostUsd(week), costDaily = estimateCostUsd(Math.ceil(week / 7));
  const label = {
    daily: scheduleLabel({ enabled: true, frequency: "daily", weekday: 0 }, tz),
    weekly: WEEKDAYS.map((_, i) => scheduleLabel({ enabled: true, frequency: "weekly", weekday: i }, tz)),
  };
  const lastHook = ws ? await lastWebhookAt(ws.id) : null;
  let origin = selfOrigin();
  if (!origin) { try { origin = await appOrigin(); } catch { origin = null; } }
  const webhookUrl = ws && origin ? `${origin}/api/live/webhook/${ws.id}` : null;
  const disabled = !ws || !hasServerStore();

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] text-zinc-900">Automation</h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">
            Urgent calls go to your inbox as soon as they&rsquo;re analyzed, and a scheduled review of every call tells you what to change in the agent.
            {ws ? <> Settings here are for <b className="font-medium text-zinc-700">{ws.name}</b>.</> : null}
          </p>
        </div>
        <Link href="/demo/inbox" className="h-9 inline-flex items-center rounded-lg border border-zinc-200 px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">Open inbox</Link>
      </div>

      {!ws && (
        <div className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
          You&rsquo;re on the sample workspace, so settings are read-only and the run below is an example.{" "}
          <Link href="/demo/settings" className="font-medium underline underline-offset-2">Create a workspace</Link> with a Retell key to turn automation on.
        </div>
      )}
      {ws && !hasServerStore() && (
        <div className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-[13px] text-amber-900">Automation needs the site&rsquo;s Vercel storage (Upstash Redis).</div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        <div className="space-y-6 min-w-0">
          <Card title="Urgent alerts" sub="Each call is checked as soon as it's analyzed. Anything below goes to the inbox with a link to the conversation.">
            <AlertsForm settings={settings} disabled={disabled} />
          </Card>
          <Card title="Scheduled analysis" sub="A full review of every call with suggested improvements, daily or weekly.">
            <ScheduleForm settings={settings} label={label} costDaily={costDaily} costWeekly={costWeekly} aiReady={aiReady} disabled={disabled} />
          </Card>
          <Card title="Past runs" action={ws ? <RunNow costDaily={costDaily} costWeekly={costWeekly} aiReady={aiReady} running={runs.some((r) => r.status === "running")} disabled={disabled} /> : undefined}>
            <RunsList runs={runs} tz={tz} />
          </Card>
        </div>

        <Card title="Setup" sub="What makes alerts instant and the schedule run on its own.">
          <ul className="divide-y divide-zinc-100 -my-3">
            <Check ok={!!lastHook} title={lastHook ? "Instant alerts are on" : "Turn on instant alerts"}>
              {lastHook
                ? <>Retell last sent a call {fmt(lastHook, tz)}. New calls are analyzed and alerted within a minute or two.</>
                : <>Paste this URL into your agent&rsquo;s <b className="font-medium text-zinc-700">Webhook URL</b> in Retell (Agent → Webhook settings). Until then, urgent calls are picked up by the daily check or when you open Call History.
                  {webhookUrl && <CopyText text={webhookUrl} />}</>}
            </Check>
            <Check ok={cronReady} title={cronReady ? "Daily check is set up" : "Recommended: add CRON_SECRET in Vercel"}>
              {cronReady ? "The daily job runs the schedule and picks up anything the webhook missed."
                : "Scheduled reports still run (from Vercel's daily job and whenever the dashboard is open). Adding CRON_SECRET (any random text, 16+ characters) also turns on the daily catch-up of missed alerts and analysis. Then redeploy."}
            </Check>
            <Check ok={aiReady} title={aiReady ? "Claude Opus 5.5 is connected" : "Add ANTHROPIC_API_KEY in Vercel"}>
              {aiReady ? "It writes the scheduled review and each call's quality judgement." : "Needed for Claude's full review and suggestions. Without it you get the numbers and the most common per-call fixes."}
            </Check>
            <Check ok={listenReady} title={listenReady ? "Audio listening is on" : "Audio listening is off"}>
              {listenReady ? "Gemini listens to each call's recording; what it hears is part of every review." : "Add GEMINI_API_KEY in Vercel so each recording is listened to, not just the transcript."}
            </Check>
          </ul>
        </Card>
      </div>
    </>
  );
}
