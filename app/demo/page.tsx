import { Suspense } from "react";
import { filtersToQuery } from "@/lib/filters";
import { summarize, previousPeriod } from "@/lib/metrics/aggregate";
import { parseBucket } from "@/lib/charts";
import { demoCalls, filterDemo, demoFilterOptions, DEMO_TZ, DEMO_BH } from "@/lib/demo/openWater";
import { demoFilters } from "@/lib/demo/params";
import RetellAnalytics, { parseBreakdown } from "@/components/overview/RetellAnalytics";
import OverviewDashboard from "@/components/overview/OverviewDashboard";
import FilterBar from "@/components/filters/FilterBar";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DemoOverview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { f } = demoFilters(sp, "/demo");
  const all = demoCalls();
  const calls = filterDemo(all, f);
  const prevRange = previousPeriod(f.from, f.to);
  const prevCalls = filterDemo(all, { ...f, ...prevRange });
  const s = summarize(calls, { timezone: DEMO_TZ, businessHours: DEMO_BH });
  const p = prevCalls.length ? summarize(prevCalls, { timezone: DEMO_TZ, businessHours: DEMO_BH }) : null;
  const q = filtersToQuery(f);
  const range = { from: f.from, to: f.to };
  const bucket = parseBucket(sp.bucket, f.from, f.to);
  const opts = demoFilterOptions();
  const customKeys = opts.customFields.map((c) => c.key);
  const breakdown = parseBreakdown(sp.breakdown, customKeys);

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Water Marine · AI Voice Receptionist</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Analytics Dashboard</h1>
        </div>
      </div>


      <Suspense><FilterBar workspaceId="demo" compact options={opts} timezone={DEMO_TZ} /></Suspense>

      {calls.length === 0 ? (
        <Empty title="No calls match these filters">The demo data covers Aug 27 – Sep 30, 2026.</Empty>
      ) : (
        <div className="space-y-8">
          <RetellAnalytics
            calls={calls}
            prevCalls={prevCalls}
            range={range}
            prevRange={prevRange}
            timezone={DEMO_TZ}
            bucket={bucket}
            compare={sp.compare === "1"}
            breakdown={breakdown}
            customKeys={customKeys}
          />
          <OverviewDashboard
            s={s}
            p={p}
            calls={calls}
            range={range}
            timezone={DEMO_TZ}
            agentName="Allen"
            bucket={bucket}
            callsHref={(extra) => `/demo/calls?${q}${extra ? `&${extra}` : ""}`}
            insightsHref={`/demo/insights?${q}`}
          />
        </div>
      )}
    </>
  );
}
