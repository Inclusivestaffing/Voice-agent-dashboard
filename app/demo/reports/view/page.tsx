import Link from "next/link";
import { demoSnapshot, filterDemo } from "@/lib/demo/openWater";
import { getSource } from "@/lib/source";
import { snapshotFromCalls } from "@/lib/reports/snapshot";
import { demoFilters } from "@/lib/demo/params";
import { ruleNarrative } from "@/lib/reports/snapshot";
import ReportView from "@/components/report/ReportView";
import DownloadPdfButton from "@/components/report/DownloadPdfButton";
import { Empty } from "@/components/ui";
import { summarizeHumanlike } from "@/lib/humanlike/summary";

export const dynamic = "force-dynamic";

export default async function DemoReportView({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const src = await getSource();
  const { f } = demoFilters(sp, "/demo/reports/view", { live: src.live, timezone: src.timezone });
  const snap = !src.live ? demoSnapshot(f) : snapshotFromCalls({
    calls: filterDemo(await src.calls(f.from, f.to), f), prev: [], transcripts: new Map(),
    workspace: { name: src.name, logo_url: "/inclusive-logo.png", brand_primary: "#facc15", agent_name: src.agentName ?? "Agent", timezone: src.timezone },
    businessHours: src.businessHours, period: { from: f.from, to: f.to },
  });
  const periodCalls = filterDemo(await src.calls(f.from, f.to), f);
  const days = (Date.parse(f.to) - Date.parse(f.from)) / 86400_000;
  const humanlike = summarizeHumanlike(periodCalls, await src.humanlike(periodCalls.map((c) => c.call_id)), { timezone: src.timezone, bucket: days > 60 ? "week" : "day" });
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 no-print print:hidden">
        <Link
          href="/demo/reports"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
        >
          ← Generate another report
        </Link>
        <div className="flex items-center gap-2">
          <DownloadPdfButton />
        </div>
      </div>
      {snap.summary.total === 0 ? <Empty title="No calls in that period, so there's nothing to report." /> : (
        <div className="border border-line -mx-4 sm:mx-0 rounded-xl overflow-hidden print:border-none print:overflow-visible print:mx-0 print:rounded-none">
          <ReportView snap={snap} narrative={ruleNarrative(snap)} humanlike={humanlike} />
        </div>
      )}
    </>
  );
}
