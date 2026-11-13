import { Suspense } from "react";
import { filtersToQuery } from "@/lib/filters";
import { toHistoryRow } from "@/lib/callHistory";
import { filterDemo, type DemoCall } from "@/lib/demo/openWater";
import { getSource } from "@/lib/source";
import { demoFilters } from "@/lib/demo/params";
import FilterBar from "@/components/filters/FilterBar";
import CallHistoryTable from "@/components/calls/CallHistoryTable";
import ExportRowsButton from "@/components/calls/ExportRowsButton";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const SORTABLE: Record<string, (c: DemoCall) => string | number> = {
  start_ts: (c) => c.start_ts ?? "", duration_ms: (c) => c.duration_ms ?? -1, combined_cost_cents: (c) => c.combined_cost_cents ?? -1,
  e2e_p50_ms: (c) => c.e2e_p50_ms ?? -1, user_sentiment: (c) => c.user_sentiment ?? "", from_number: (c) => c.from_number ?? "",
  disconnection_reason: (c) => c.disconnection_reason ?? "",
};

export default async function DemoCalls({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const src = await getSource();
  const { f } = demoFilters(sp, "/demo/calls", { live: src.live, timezone: src.timezone });
  let all: DemoCall[] = [];
  let loadError: string | null = null;
  try { all = await src.calls(f.from, f.to); } catch (e) { loadError = e instanceof Error ? e.message : String(e); }
  const sort = SORTABLE[sp.sort] ? sp.sort : "start_ts";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const key = SORTABLE[sort];
  const rows = filterDemo(all, f).sort((a, b) => {
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1);
  });
  const historyRows = rows.map(toHistoryRow);
  const base = filtersToQuery(f);
  const nav = new URLSearchParams(base); nav.set("sort", sort); nav.set("dir", dir);

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] text-zinc-900">Call History</h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">Every call with its outcome. Open one to hear it, read the transcript and see the AI diagnosis.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] text-zinc-500 tabular">{rows.length} calls</span>
          <ExportRowsButton rows={historyRows} name={src.live ? "retell-calls" : "open-water-marine-calls"} />
        </div>
      </div>

      <Suspense><FilterBar workspaceId="demo" compact options={await src.filterOptions(all)} timezone={src.timezone} /></Suspense>

      {loadError ? (
        <Empty title="Couldn't load calls from Retell">{loadError} Check the connection in Settings.</Empty>
      ) : rows.length === 0 ? (
        <Empty title="No calls match these filters">{src.live ? "Try a wider date range, or check which agents are selected in Settings." : undefined}</Empty>
      ) : (
        <CallHistoryTable rows={historyRows} timezone={src.timezone} detailBase="/demo/calls" navQuery={nav.toString()} sortBase={base} sort={sort} dir={dir} drawerApi="/api/demo/calls" />
      )}
    </>
  );
}
