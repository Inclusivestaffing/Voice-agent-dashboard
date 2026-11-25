import Link from "next/link";
import { notFound } from "next/navigation";
import { getSource } from "@/lib/source";
import { RUN_ID, getRun } from "@/lib/automation/digest";
import { SAMPLE_RUN_ID, sampleRun } from "@/lib/automation/sample";
import DigestView from "@/components/automation/DigestView";
import ReportView from "@/components/report/ReportView";
import DownloadPdfButton from "@/components/report/DownloadPdfButton";
import { Empty, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/** One scheduled analysis report: Claude's review, and every metric for the period. */
export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const view = (await searchParams).view === "metrics" ? "metrics" : "review";
  if (!RUN_ID.test(id)) notFound();
  const src = await getSource();
  const run = id === SAMPLE_RUN_ID && !src.conn ? sampleRun() : src.conn ? await getRun(src.conn.id, id) : null;
  if (!run) notFound();
  const done = run.status === "done" && run.narrative && run.stats;
  const tab = (v: "review" | "metrics", label: string) => (
    <Link href={`/demo/automation/runs/${id}${v === "metrics" ? "?view=metrics" : ""}`} role="tab" aria-selected={view === v}
      className={cx("h-8 inline-flex items-center rounded-md px-3 text-[13px] font-medium", view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100")}>
      {label}
    </Link>
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 no-print print:hidden">
        <Link href="/demo/automation" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900">← Automation</Link>
        {done && (
          <div role="tablist" aria-label="Report view" className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-200 p-0.5">
            {tab("review", "Review & fixes")}
            {tab("metrics", "All metrics")}
          </div>
        )}
        {done && view === "metrics" && run.snapshot && <DownloadPdfButton />}
      </div>
      {!done ? (
        run.status === "running" ? <Empty title="This analysis is still running">It usually takes 1–3 minutes. Refresh in a moment.</Empty>
          : <Empty title={run.status === "skipped" ? "Nothing to analyze" : "This analysis failed"}>{run.note ?? run.error ?? ""}</Empty>
      ) : view === "review" ? (
        <DigestView run={run} tz={src.timezone} />
      ) : run.snapshot ? (
        <div className="border border-line -mx-4 sm:mx-0 rounded-xl overflow-hidden print:border-none print:overflow-visible print:mx-0 print:rounded-none">
          <ReportView snap={run.snapshot} narrative={null} humanlike={run.humanlike ?? null} />
        </div>
      ) : (
        <Empty title="No metrics stored for this report">Reports made before metrics were added only have the review. Use Run now for a new one.</Empty>
      )}
    </>
  );
}
