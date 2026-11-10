import Link from "next/link";
import { Suspense } from "react";
import { getWorkspace, listCalls, filterOptions } from "@/lib/db/queries";
import { parseFilters, filtersToQuery } from "@/lib/filters";
import { toHistoryRow } from "@/lib/callHistory";
import FilterBar from "@/components/filters/FilterBar";
import CallHistoryTable from "@/components/calls/CallHistoryTable";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function CallsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { db, ws } = await getWorkspace(slug);
  const f = parseFilters(sp, ws.timezone);
  const page = Math.min(10_000, Math.max(0, Math.floor(Number(sp.page ?? 0)) || 0));
  const sort = sp.sort ?? "start_ts";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const [{ rows, total }, options, { data: views }] = await Promise.all([
    listCalls(db, ws.id, f, page, PAGE_SIZE, sort, dir),
    filterOptions(db, ws.id),
    db.from("saved_views").select("id, name, query").eq("workspace_id", ws.id).order("created_at"),
  ]);
  const base = filtersToQuery(f);
  const nav = new URLSearchParams(base);
  nav.set("sort", sort); nav.set("dir", dir);
  const pageLink = (p: number) => { const n = new URLSearchParams(nav); n.set("page", String(p)); return `?${n}`; };

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="eyebrow">{ws.name}</div>
          <h1 className="text-xl font-medium mt-1">Call History</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-dim">
          <span>{total.toLocaleString()} calls</span>
          <a href={`/api/w/${ws.id}/export?${base}`} className="border border-line-strong bg-surface px-3 py-1.5 font-medium hover:text-ink rounded-xl">Export CSV</a>
        </div>
      </div>
      <Suspense><FilterBar workspaceId={ws.id} options={options} savedViews={views ?? []} /></Suspense>

      {rows.length === 0 ? <Empty title="No calls match these filters" /> : (
        <>
          <CallHistoryTable rows={rows.map(toHistoryRow)} timezone={ws.timezone} detailBase={`/w/${slug}/calls`} navQuery={nav.toString()} sortBase={base} sort={sort} dir={dir} />
          <div className="flex items-center justify-between mt-4 text-xs">
            <span className="text-dim">Showing {page * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE + rows.length)} of {total.toLocaleString()}</span>
            <div className="flex gap-2">
              {page > 0 && <Link href={pageLink(page - 1)} className="border border-line-strong px-3 py-1.5 bg-surface rounded-xl">← Prev</Link>}
              {(page + 1) * PAGE_SIZE < total && <Link href={pageLink(page + 1)} className="border border-line-strong px-3 py-1.5 bg-surface rounded-xl">Next →</Link>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
