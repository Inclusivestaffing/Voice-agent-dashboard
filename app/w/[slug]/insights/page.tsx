import { Suspense } from "react";
import { getWorkspace, loadAnalyticsCalls, filterOptions } from "@/lib/db/queries";
import { parseFilters, filtersToQuery } from "@/lib/filters";
import { previousPeriod } from "@/lib/metrics/aggregate";
import FilterBar from "@/components/filters/FilterBar";
import InsightsView from "@/components/insights/InsightsView";
import { Empty } from "@/components/ui";
import { TopTabBar } from "@/components/navigation/TopTabBar";

export const dynamic = "force-dynamic";

export default async function InsightsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { db, ws } = await getWorkspace(slug);
  const f = parseFilters(sp, ws.timezone);
  const [calls, prev, options] = await Promise.all([
    loadAnalyticsCalls(db, ws.id, f, { withAnalysis: true }),
    loadAnalyticsCalls(db, ws.id, { ...f, ...previousPeriod(f.from, f.to) }),
    filterOptions(db, ws.id),
  ]);
  const q = filtersToQuery(f);
  const link = (id: string) => `/w/${slug}/calls/${id}?${q}`;
  const analyzed = calls.filter((c) => c.analysis).length;

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{ws.name} · Voice Analytics</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Insights & Root Causes</h1>
          <p className="text-sm text-slate-500 mt-1">What&apos;s going wrong across calls, why, and recommended fixes. Based on {analyzed} AI-analyzed calls.</p>
        </div>
      </div>

      <TopTabBar basePath={`/w/${slug}`} />

      <Suspense><FilterBar workspaceId={ws.id} options={options} compact /></Suspense>

      {analyzed === 0 ? (
        <Empty title="No analyzed calls in this period">Calls are analyzed automatically after they sync. Use “Analyze now” on the Overview page to speed it up.</Empty>
      ) : (
        <InsightsView calls={calls} prev={prev} timezone={ws.timezone} businessHours={ws.business_hours} link={link}
          callsHref={(extra) => `/w/${slug}/calls?${q}&${extra}`} />
      )}
    </>
  );
}
