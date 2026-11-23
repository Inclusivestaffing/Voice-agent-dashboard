import { Suspense } from "react";
import { after } from "next/server";
import { summarizeHumanlike } from "@/lib/humanlike/summary";
import { sweepLive } from "@/lib/humanlike/run";
import HumanlikeSection from "@/components/overview/HumanlikeSection";
import { getWorkspaceFeedback } from "@/lib/humanlike/feedbackStore";
import { accuracySummary } from "@/lib/humanlike/feedback";
import { SAMPLE_ID } from "@/lib/live/conn";
import { filtersToQuery } from "@/lib/filters";
import { summarize, previousPeriod } from "@/lib/metrics/aggregate";
import { parseBucket } from "@/lib/charts";
import { filterDemo } from "@/lib/demo/openWater";
import { getSource } from "@/lib/source";
import { demoFilters } from "@/lib/demo/params";
import RetellAnalytics, { parseBreakdown } from "@/components/overview/RetellAnalytics";
import OverviewDashboard from "@/components/overview/OverviewDashboard";
import FilterBar from "@/components/filters/FilterBar";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
// Background catch-up of human-likeness analysis runs after the page is sent.
export const maxDuration = 60;

export default async function DemoOverview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const src = await getSource();
  const { f } = demoFilters(sp, "/demo", { live: src.live, timezone: src.timezone });
  const prevRange = previousPeriod(f.from, f.to);
  let all: Awaited<ReturnType<typeof src.calls>> = [];
  let loadError: string | null = null;
  try { all = await src.calls(prevRange.from < f.from ? prevRange.from : f.from, f.to); }
  catch (e) { loadError = e instanceof Error ? e.message : String(e); }
  const calls = filterDemo(all, f);
  const prevCalls = filterDemo(all, { ...f, ...prevRange });
  const ctx = { timezone: src.timezone, businessHours: src.businessHours };
  const s = summarize(calls, ctx);
  const p = prevCalls.length ? summarize(prevCalls, ctx) : null;
  const q = filtersToQuery(f);
  const range = { from: f.from, to: f.to };
  const bucket = parseBucket(sp.bucket, f.from, f.to);
  const hlResults = await src.humanlike(calls.map((c) => c.call_id));
  const hl = summarizeHumanlike(calls, hlResults, { timezone: src.timezone, bucket });
  const fbWs = await getWorkspaceFeedback(src.conn?.id ?? SAMPLE_ID);
  const accuracy = fbWs ? accuracySummary(fbWs) : null;
  // Live workspace: analyze not-yet-reviewed calls in the background, newest first.
  if (src.live && src.conn && hl.pending > 0) {
    const ws = src.conn;
    const todo = [...calls].sort((x, y) => (y.start_ts ?? "").localeCompare(x.start_ts ?? "")).filter((c) => !hlResults.has(c.call_id)).map((c) => c.call_id);
    after(() => sweepLive(ws, todo, { max: 6, budgetMs: 50_000 }).then(() => undefined));
  }
  const opts = await src.filterOptions(all);
  const customKeys = opts.customFields.map((c) => c.key);
  const breakdown = parseBreakdown(sp.breakdown, customKeys);

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] text-zinc-900">Analytics</h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">{src.live ? `Live calls from your Retell account${src.agentName ? `, agent ${src.agentName}` : ""}.` : "How Allen, the AI receptionist, handled calls in this period (sample data)."}</p>
        </div>
      </div>

      <Suspense><FilterBar workspaceId="demo" compact options={opts} timezone={src.timezone} /></Suspense>

      {loadError ? (
        <Empty title="Couldn't load calls from Retell">{loadError} Check the connection in Settings.</Empty>
      ) : calls.length === 0 ? (
        <Empty title="No calls match these filters">{src.live ? "Try a wider date range, or check which agents are selected in Settings." : "The demo data covers Aug 27 – Sep 30, 2026."}</Empty>
      ) : (
        <div className="space-y-14">
          <OverviewDashboard
            s={s}
            p={p}
            calls={calls}
            range={range}
            timezone={src.timezone}
            agentName={src.agentName}
            bucket={bucket}
            callsHref={(extra) => `/demo/calls?${q}${extra ? `&${extra}` : ""}`}
            live={src.live}
          />
          <HumanlikeSection s={hl} live={src.live} accuracy={accuracy} callHref={(id) => `/demo/calls?${q}&call=${encodeURIComponent(id)}`} />
          <RetellAnalytics
            calls={calls}
            prevCalls={prevCalls}
            range={range}
            prevRange={prevRange}
            timezone={src.timezone}
            bucket={bucket}
            compare={sp.compare === "1"}
            breakdown={breakdown}
            customKeys={customKeys}
          />
        </div>
      )}
    </>
  );
}
