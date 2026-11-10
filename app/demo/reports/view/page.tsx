import Link from "next/link";
import { demoSnapshot } from "@/lib/demo/openWater";
import { demoFilters } from "@/lib/demo/params";
import { ruleNarrative } from "@/lib/reports/snapshot";
import ReportView from "@/components/report/ReportView";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DemoReportView({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { f } = demoFilters(sp, "/demo/reports/view");
  const snap = demoSnapshot(f);
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href="/demo/reports" className="text-xs text-dim hover:text-ink">← Generate another report</Link>
        <span className="text-xs text-muted">In a live workspace: Download PDF · Copy share link · Revoke link</span>
      </div>
      {snap.summary.total === 0 ? <Empty title="No calls in that period, so there's nothing to report." /> : (
        <div className="border border-line -mx-4 sm:mx-0 rounded-2xl overflow-hidden">
          <ReportView snap={snap} narrative={ruleNarrative(snap)} />
        </div>
      )}
    </>
  );
}
