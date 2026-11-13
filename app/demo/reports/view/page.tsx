import Link from "next/link";
import { demoSnapshot, filterDemo } from "@/lib/demo/openWater";
import { getSource } from "@/lib/source";
import { snapshotFromCalls } from "@/lib/reports/snapshot";
import { demoFilters } from "@/lib/demo/params";
import { ruleNarrative } from "@/lib/reports/snapshot";
import ReportView from "@/components/report/ReportView";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DemoReportView({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const src = await getSource();
  const { f } = demoFilters(sp, "/demo/reports/view", { live: src.live, timezone: src.timezone });
  const snap = !src.live ? demoSnapshot(f) : snapshotFromCalls({
    calls: filterDemo(await src.calls(f.from, f.to), f), prev: [], transcripts: new Map(),
    workspace: { name: src.name, logo_url: null, brand_primary: "#facc15", agent_name: src.agentName ?? "Agent", timezone: src.timezone },
    businessHours: src.businessHours, period: { from: f.from, to: f.to },
  });
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href="/demo/reports" className="text-xs text-dim hover:text-ink">← Generate another report</Link>
              </div>
      {snap.summary.total === 0 ? <Empty title="No calls in that period, so there's nothing to report." /> : (
        <div className="border border-line -mx-4 sm:mx-0 rounded-xl overflow-hidden">
          <ReportView snap={snap} narrative={ruleNarrative(snap)} />
        </div>
      )}
    </>
  );
}
