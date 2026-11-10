import Link from "next/link";
import { getWorkspace, filterOptions } from "@/lib/db/queries";
import { Card, Empty, fmtDate } from "@/components/ui";
import ReportForm from "./ReportForm";
import { TopTabBar } from "@/components/navigation/TopTabBar";
import { canEdit } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // report generation (Opus narrative) can take a minute or two

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, ws, role } = await getWorkspace(slug);
  const [{ data: reports }, options] = await Promise.all([
    db.from("reports").select("id, title, period_start, period_end, created_at, share_token, snapshot->summary->total").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    filterOptions(db, ws.id),
  ]);

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{ws.name} · Voice Analytics</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Client Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Branded, client-ready reports for any period. Numbers come straight from the call data; Claude writes the plain-English explanation.</p>
        </div>
      </div>

      <TopTabBar basePath={`/w/${slug}`} />

      {canEdit(role) && (
        <Card title="Generate a report" className="mb-6">
          <ReportForm slug={slug} agents={options.agents} />
        </Card>
      )}
      {(reports ?? []).length === 0 ? <Empty title="No reports yet" /> : (
        <div className="border border-line bg-surface divide-y divide-line">
          {(reports ?? []).map((r) => (
            <Link key={r.id} href={`/w/${slug}/reports/${r.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-surface-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.title}</div>
                <div className="text-xs text-dim mt-0.5">{fmtDate(r.period_start, ws.timezone, false)} → {fmtDate(r.period_end, ws.timezone, false)} · {String((r as Record<string, unknown>).total ?? "")} calls</div>
              </div>
              <div className="text-xs text-muted shrink-0">Created {fmtDate(r.created_at, ws.timezone)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
