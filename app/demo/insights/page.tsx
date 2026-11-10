import { Suspense } from "react";
import { filtersToQuery } from "@/lib/filters";
import { previousPeriod } from "@/lib/metrics/aggregate";
import { demoCalls, filterDemo, demoFilterOptions, DEMO_TZ, DEMO_BH } from "@/lib/demo/openWater";
import { demoFilters } from "@/lib/demo/params";
import FilterBar from "@/components/filters/FilterBar";
import InsightsView from "@/components/insights/InsightsView";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DemoInsights({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { f } = demoFilters(sp, "/demo/insights");
  const all = demoCalls();
  const calls = filterDemo(all, f);
  const prev = filterDemo(all, { ...f, ...previousPeriod(f.from, f.to) });
  const q = filtersToQuery(f);
  const analyzed = calls.filter((c) => c.analysis).length;
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Water Marine · AI Voice Receptionist</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Insights & Root Causes</h1>
          <p className="text-sm text-slate-500 mt-1">What&apos;s going wrong across calls, why, and recommended fixes. Based on {analyzed} AI-analyzed calls.</p>
        </div>
      </div>


      <Suspense><FilterBar workspaceId="demo" compact options={demoFilterOptions()} /></Suspense>
      {analyzed === 0 ? <Empty title="No analyzed calls in this period" /> : (
        <InsightsView calls={calls} prev={prev} timezone={DEMO_TZ} businessHours={DEMO_BH}
          link={(id) => `/demo/calls/${id}?${q}`} callsHref={(extra) => `/demo/calls?${q}&${extra}`} />
      )}
    </>
  );
}
