import { Suspense } from "react";
import { filtersToQuery } from "@/lib/filters";
import { toHistoryRow } from "@/lib/callHistory";
import { demoCalls, filterDemo, demoFilterOptions, DEMO_TZ } from "@/lib/demo/openWater";
import { demoFilters } from "@/lib/demo/params";
import FilterBar from "@/components/filters/FilterBar";
import CallHistoryTable from "@/components/calls/CallHistoryTable";
import ExportRowsButton from "@/components/calls/ExportRowsButton";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const SORTABLE: Record<string, (c: ReturnType<typeof demoCalls>[number]) => string | number> = {
  start_ts: (c) => c.start_ts ?? "", duration_ms: (c) => c.duration_ms ?? -1, combined_cost_cents: (c) => c.combined_cost_cents ?? -1,
  e2e_p50_ms: (c) => c.e2e_p50_ms ?? -1, user_sentiment: (c) => c.user_sentiment ?? "", from_number: (c) => c.from_number ?? "",
  disconnection_reason: (c) => c.disconnection_reason ?? "",
};

export default async function DemoCalls({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { f } = demoFilters(sp, "/demo/calls");
  const sort = SORTABLE[sp.sort] ? sp.sort : "start_ts";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const key = SORTABLE[sort];
  const rows = filterDemo(demoCalls(), f).sort((a, b) => {
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
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Water Marine · AI Voice Receptionist</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Call History</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">{rows.length} calls recorded</span>
          <ExportRowsButton rows={historyRows} name="open-water-marine-calls" />
        </div>
      </div>

      <Suspense><FilterBar workspaceId="demo" compact options={demoFilterOptions()} /></Suspense>

      {rows.length === 0 ? (
        <Empty title="No calls match these filters" />
      ) : (
        <CallHistoryTable rows={historyRows} timezone={DEMO_TZ} detailBase="/demo/calls" navQuery={nav.toString()} sortBase={base} sort={sort} dir={dir} />
      )}
    </>
  );
}
