import Link from "next/link";
import { Card, cx } from "@/components/ui";
import { getSource } from "@/lib/source";
import { listRuns } from "@/lib/automation/digest";
import { sampleRun } from "@/lib/automation/sample";
import DemoReportForm from "./DemoReportForm";

export const dynamic = "force-dynamic";

const HEALTH: Record<string, { label: string; cls: string }> = {
  good: { label: "Good", cls: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
  watch: { label: "Worth a look", cls: "bg-amber-50 text-amber-800 border-amber-200/80" },
  needs_attention: { label: "Needs attention", cls: "bg-rose-50 text-rose-700 border-rose-200/80" },
};

/** Reports section: generate a report, and every scheduled analysis report. */
export default async function DemoReports() {
  const src = await getSource();
  const runs = (src.conn ? await listRuns(src.conn.id, 30) : [sampleRun()]).filter((r) => r.status === "done");
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: src.timezone, month: "short", day: "numeric" }).format(new Date(iso));
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] text-zinc-900">Reports</h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">Pick a period and generate a branded report for your client. Every number comes straight from the call logs.</p>
        </div>
      </div>

      <Card title="Generate a report" className="mb-6">
        <DemoReportForm />
      </Card>

      <Card title="Scheduled analysis reports" sub="Made automatically (set the schedule in Automation): every metric for the period plus Claude's review and fixes."
        action={<Link href="/demo/automation" className="shrink-0 text-[12.5px] font-medium text-zinc-600 hover:text-zinc-900">Schedule →</Link>} className="mb-6">
        {runs.length ? (
          <ul className="divide-y divide-zinc-100 -my-2">
            {runs.map((r) => {
              const h = r.narrative ? HEALTH[r.narrative.health] : null;
              return (
                <li key={r.id}>
                  <Link href={`/demo/automation/runs/${r.id}?view=metrics`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg -mx-2 px-2 py-2.5 hover:bg-zinc-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-zinc-900">
                        {r.frequency === "daily" ? "Daily" : "Weekly"} report · {fmt(r.period.from)} – {fmt(r.period.to)}
                        {r.sample && <span className="ml-2 rounded bg-zinc-100 px-1 py-px text-[10.5px] font-medium text-zinc-500 align-middle">Sample</span>}
                      </span>
                      <span className="block text-[12px] text-zinc-500 truncate">{r.stats ? `${r.stats.calls} calls · avg quality ${r.stats.avgScore ?? "—"}` : ""}{r.narrative ? ` · ${r.narrative.headline}` : ""}</span>
                    </span>
                    {h && <span className={cx("rounded-full border px-2 py-0.5 text-[11.5px] font-medium", h.cls)}>{h.label}</span>}
                    <span className="text-zinc-300" aria-hidden>→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-[13px] text-zinc-500">No scheduled reports yet. Turn on the schedule in <Link href="/demo/automation" className="font-medium text-zinc-800 underline underline-offset-2">Automation</Link>.</p>}
      </Card>
      <p className="text-xs text-zinc-400">In the demo, the summary is written by the built-in rule engine. In a live workspace you can choose to have Claude Opus 5.5 write it.</p>
    </>
  );
}
