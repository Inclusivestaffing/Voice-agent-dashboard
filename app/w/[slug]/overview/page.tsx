import Link from "next/link";
import { Suspense } from "react";
import { getWorkspace, loadAnalyticsCalls, filterOptions } from "@/lib/db/queries";
import { parseFilters, filtersToQuery } from "@/lib/filters";
import { summarize, previousPeriod } from "@/lib/metrics/aggregate";
import { renderChart, parseBucket, type ChartConfig } from "@/lib/charts";
import OverviewDashboard from "@/components/overview/OverviewDashboard";
import RetellAnalytics, { parseBreakdown } from "@/components/overview/RetellAnalytics";
import Chart from "@/components/charts/Chart";
import FilterBar from "@/components/filters/FilterBar";
import { ChartBuilder, DeleteChartButton } from "@/components/charts/ChartBuilder";
import { Card, Empty, fmtDur, fmtMs } from "@/components/ui";
import SyncButtons from "./SyncButtons";
import { TopTabBar } from "@/components/navigation/TopTabBar";
import { canEdit, ROLE_LABEL, isRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { db, ws, role } = await getWorkspace(slug);
  const f = parseFilters(sp, ws.timezone);
  const prevRange = previousPeriod(f.from, f.to);
  const ctx = { timezone: ws.timezone, businessHours: ws.business_hours };

  const [calls, prevCalls, options, { data: views }, { data: charts }, { count: totalEver }] = await Promise.all([
    loadAnalyticsCalls(db, ws.id, f),
    f.range === "all" ? Promise.resolve([]) : loadAnalyticsCalls(db, ws.id, { ...f, ...prevRange }),
    filterOptions(db, ws.id),
    db.from("saved_views").select("id, name, query").eq("workspace_id", ws.id).order("created_at"),
    db.from("dashboard_charts").select("id, title, config").eq("workspace_id", ws.id).order("position"),
    db.from("calls").select("call_id", { count: "exact", head: true }).eq("workspace_id", ws.id),
  ]);
  const s = summarize(calls, ctx);
  const p = prevCalls.length ? summarize(prevCalls, ctx) : null;
  const q = filtersToQuery(f);
  const callsLink = (extra: string) => `/w/${slug}/calls?${q}${extra ? `&${extra}` : ""}`;

  const range = { from: f.from, to: f.to };
  const bucket = parseBucket(sp.bucket, f.from, f.to);
  const compare = sp.compare === "1";
  const breakdown = parseBreakdown(sp.breakdown, options.customFields.map((c) => c.key));
  const pending = s.by_outcome["unanalyzed"] ?? 0;

  if ((totalEver ?? 0) === 0) {
    return (
      <>
        <PageHead ws={ws.name} />
        <Empty title={sp.welcome ? "Workspace created — importing calls from Retell…" : "No calls yet"}>
          {sp.welcome
            ? "The first import runs in the background and usually takes under a minute. Refresh this page shortly."
            : <>Connect a Retell API key in <Link className="underline" href={`/w/${slug}/settings`}>Settings</Link>, then calls will appear here automatically.</>}
          {canEdit(role) && <div className="mt-4"><SyncButtons workspaceId={ws.id} /></div>}
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHead ws={ws.name} right={canEdit(role) ? <SyncButtons workspaceId={ws.id} pending={pending} /> : null} />
      <TopTabBar basePath={`/w/${slug}`} />
      <Suspense><FilterBar workspaceId={ws.id} options={options} savedViews={views ?? []} timezone={ws.timezone} /></Suspense>

      {calls.length === 0 ? <Empty title="No calls match these filters">Try a wider date range or clear some filters.</Empty> : (
        <div className="space-y-6">
          <RetellAnalytics calls={calls} prevCalls={prevCalls} range={range} prevRange={prevRange} timezone={ws.timezone} bucket={bucket} compare={compare}
            breakdown={breakdown} customKeys={options.customFields.map((c) => c.key)} />
          <OverviewDashboard s={s} p={p} calls={calls} range={range} timezone={ws.timezone} agentName={ws.agent_display_name} bucket={bucket}
            callsHref={callsLink} insightsHref={`/w/${slug}/insights?${q}`} />

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="section-title">Custom charts</h2>
              {canEdit(role) && <ChartBuilder workspaceId={ws.id} customKeys={options.customFields.map((c) => c.key)} />}
            </div>
            {(charts ?? []).length === 0 ? (
              <p className="text-sm text-dim">Build your own charts from any metric, with breakdowns by agent, version, outcome, disconnection reason or your post-call fields — the same options as Retell&apos;s dashboard.</p>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                {(charts ?? []).map((c) => {
                  const r = renderChart(c.config as ChartConfig, calls, range, ws.timezone);
                  return (
                    <Card key={c.id} title={c.title} action={canEdit(role) ? <DeleteChartButton workspaceId={ws.id} id={c.id} /> : null}>
                      {r.kind === "number"
                        ? <div className="text-5xl font-semibold tracking-tight py-8">{r.number == null ? "—" : r.unit === "%" ? `${r.number.toFixed(1)}%` : r.unit === "$" ? `$${r.number.toFixed(2)}` : r.unit === "ms" ? fmtMs(r.number) : r.unit === "s" ? fmtDur(r.number) : Math.round(r.number * 10) / 10}</div>
                        : <Chart kind={r.kind} unit={r.unit} ariaLabel={c.title} categories={r.categories} series={r.series} />}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function PageHead({ ws, right }: { ws: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{ws} · Voice Analytics</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Analytics Dashboard</h1>
      </div>
      {right}
    </div>
  );
}
