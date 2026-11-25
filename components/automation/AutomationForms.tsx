"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button, cx } from "@/components/ui";
import { toast } from "@/components/feedback/Toaster";
import { saveAlerts, saveSchedule, runNow, type AutoState } from "@/app/demo/automation/actions";
import { INBOX_REASONS, REASON_HELP, REASON_LABEL } from "@/lib/inbox/types";
import { WEEKDAYS, type AutomationSettings } from "@/lib/automation/types";

const field = "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-[0_1px_1px_rgb(15_23_42/0.03)] hover:border-zinc-300 focus:border-zinc-400 focus-visible:outline-none focus:ring-4 focus:ring-zinc-900/5 disabled:bg-zinc-50 disabled:text-zinc-400";

function Status({ state }: { state: AutoState }) {
  if (!state) return null;
  return <p role={state.error ? "alert" : "status"} className={cx("text-[13px]", state.error ? "text-rose-600" : "text-emerald-700")}>{state.error ?? state.message}</p>;
}

/** Urgent alerts: quality threshold + which kinds of calls go to the inbox. */
export function AlertsForm({ settings, disabled = false }: { settings: AutomationSettings; disabled?: boolean }) {
  const [state, action, pending] = useActionState(saveAlerts, null);
  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5">
        <label className="block max-w-xs">
          <span className="block text-[13px] font-medium text-zinc-700">Quality alert below</span>
          <span className="mt-1.5 flex items-center gap-2">
            <input name="threshold" type="number" min={0} max={100} step={1} required defaultValue={settings.alerts.threshold} className={cx(field, "w-24 tabular")} aria-describedby="threshold-help" />
            <span className="text-sm text-zinc-500">out of 100</span>
          </span>
          <span id="threshold-help" className="mt-1.5 block text-[12px] leading-relaxed text-zinc-500">90 means 9 out of 10. Calls scoring 85+ are labelled &ldquo;Sounds human&rdquo;, so a high threshold flags more calls.</span>
        </label>
        <div>
          <span className="block text-[13px] font-medium text-zinc-700">Send these to the inbox</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {INBOX_REASONS.map((r) => (
              <label key={r} className="flex gap-2.5 rounded-lg border border-zinc-200 px-3 py-2.5 hover:border-zinc-300 has-[:checked]:border-zinc-400 has-[:checked]:bg-zinc-50/60">
                <input type="checkbox" name="reason" value={r} defaultChecked={settings.alerts.reasons[r]} className="mt-0.5 h-4 w-4 accent-zinc-900" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-zinc-900">{r === "low_quality" ? "Low quality score" : REASON_LABEL[r]}</span>
                  <span className="block text-[12px] leading-snug text-zinc-500">{REASON_HELP[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled || pending}>{pending ? "Saving…" : "Save alerts"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

/** Scheduled analysis: on/off, daily or weekly (and which day), plus Run now. */
export function ScheduleForm({ settings, label, costDaily, costWeekly, aiReady, disabled = false }: {
  settings: AutomationSettings; label: { daily: string; weekly: string[] }; costDaily: number; costWeekly: number; aiReady: boolean; disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(saveSchedule, null);
  const [enabled, setEnabled] = useState(settings.schedule.enabled);
  const [freq, setFreq] = useState(settings.schedule.frequency);
  const [weekday, setWeekday] = useState(settings.schedule.weekday);
  const when = freq === "daily" ? label.daily : label.weekly[weekday];
  const cost = freq === "daily" ? costDaily : costWeekly;
  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-zinc-200 transition-colors peer-checked:bg-zinc-900 peer-focus-visible:ring-4 peer-focus-visible:ring-zinc-900/10 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
          <span>
            <span className="block text-[13.5px] font-medium text-zinc-900">Run the analysis automatically</span>
            <span className="block text-[12.5px] text-zinc-500">{enabled ? when : "Off. You can still use Run now below."}</span>
          </span>
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <div role="radiogroup" aria-label="How often" className="inline-flex rounded-lg border border-zinc-200 p-0.5">
            {(["daily", "weekly"] as const).map((f) => (
              <label key={f} className={cx("cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-medium", freq === f ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}>
                <input type="radio" name="frequency" value={f} checked={freq === f} onChange={() => setFreq(f)} className="sr-only" />
                {f === "daily" ? "Every day" : "Every week"}
              </label>
            ))}
          </div>
          {freq === "weekly" && (
            <label className="block">
              <span className="block text-[12.5px] font-medium text-zinc-600">On</span>
              <select name="weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={cx(field, "mt-1 h-9")}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
          )}
          {freq === "daily" && <input type="hidden" name="weekday" value={weekday} />}
        </div>
        <p className="text-[12.5px] leading-relaxed text-zinc-500">
          Each run reviews every call from the last {freq === "daily" ? "24 hours" : "7 days"}: transcripts with tool calls, each call&rsquo;s audio and quality analysis, and the agent&rsquo;s current prompt.{" "}
          {aiReady ? <>Claude Opus 5.5 writes the review. At your recent call volume that&rsquo;s about <b className="font-semibold text-zinc-700">${cost.toFixed(2)} per run</b>.</> : <>Add ANTHROPIC_API_KEY in Vercel to have Claude Opus 5.5 write it; until then you get the numbers and the most common per-call fixes.</>}
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled || pending}>{pending ? "Saving…" : "Save schedule"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function RunNow({ costDaily, costWeekly, aiReady, running, disabled = false }: { costDaily: number; costWeekly: number; aiReady: boolean; running: boolean; disabled?: boolean }) {
  const [state, action, pending] = useActionState(runNow, null);
  const [freq, setFreq] = useState<"daily" | "weekly">("weekly");
  const router = useRouter();
  const busy = running || (!!state?.ok && !state.error);
  // While a run is going, check back every 8 seconds so the result appears without a reload.
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => router.refresh(), 8000);
    const stop = window.setTimeout(() => window.clearInterval(t), 6 * 60_000);
    return () => { window.clearInterval(t); window.clearTimeout(stop); };
  }, [busy, router]);
  useEffect(() => { if (state?.ok) toast("Analysis started"); }, [state]);
  const cost = freq === "daily" ? costDaily : costWeekly;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor="run-period">Period</label>
      <select id="run-period" name="frequency" value={freq} onChange={(e) => setFreq(e.target.value as "daily" | "weekly")} disabled={disabled} className={cx(field, "h-9")}>
        <option value="weekly">Last 7 days</option>
        <option value="daily">Last 24 hours</option>
      </select>
      <Button type="submit" variant="ghost" disabled={disabled || pending || running}>
        {running ? "Running…" : pending ? "Starting…" : aiReady ? `Run now (about $${cost.toFixed(2)})` : "Run now"}
      </Button>
      <Status state={state} />
    </form>
  );
}
