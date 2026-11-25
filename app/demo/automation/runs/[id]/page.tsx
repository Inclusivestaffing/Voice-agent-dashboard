import Link from "next/link";
import { notFound } from "next/navigation";
import { getSource } from "@/lib/source";
import { RUN_ID, getRun } from "@/lib/automation/digest";
import { SAMPLE_RUN_ID, sampleRun } from "@/lib/automation/sample";
import DigestView from "@/components/automation/DigestView";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/** One finished Automation analysis for the current workspace. */
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const src = await getSource();
  const run = id === SAMPLE_RUN_ID && !src.conn ? sampleRun() : src.conn ? await getRun(src.conn.id, id) : null;
  if (!run) notFound();
  return (
    <>
      <div className="mb-4">
        <Link href="/demo/automation" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900">← Automation</Link>
      </div>
      {run.status === "done" && run.narrative && run.stats ? <DigestView run={run} tz={src.timezone} />
        : run.status === "running" ? <Empty title="This analysis is still running">It usually takes 1–3 minutes. Refresh in a moment.</Empty>
        : <Empty title={run.status === "skipped" ? "Nothing to analyze" : "This analysis failed"}>{run.note ?? run.error ?? ""}</Empty>}
    </>
  );
}
