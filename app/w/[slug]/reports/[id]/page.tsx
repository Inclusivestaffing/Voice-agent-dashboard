import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/lib/db/queries";
import { appOrigin } from "@/lib/origin";
import ReportView from "@/components/report/ReportView";
import type { ReportSnapshot } from "@/lib/reports/snapshot";
import type { ReportNarrative } from "@/lib/ai/schemas";
import CopyLink from "./CopyLink";
import ReportActions from "./ReportActions";
import { canEdit } from "@/lib/roles";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReportPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { db, ws, role } = await getWorkspace(slug);
  const { data: r } = await db.from("reports").select("*").eq("id", id).eq("workspace_id", ws.id).maybeSingle();
  if (!r) notFound();
  const shareUrl = `${await appOrigin()}/r/${r.share_token}`;
  const narrative = r.narrative as (ReportNarrative & { _unverified_numbers?: string[]; _source?: string }) | null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href={`/w/${slug}/reports`} className="text-xs text-dim hover:text-ink">← All reports</Link>
        <div className="flex gap-2 flex-wrap">
          <CopyLink url={shareUrl} />
          <a href={`/api/reports/${r.id}/pdf`} className="bg-ink text-white px-3.5 py-2 text-xs font-medium hover:opacity-90 rounded-xl">Download PDF</a>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="border border-line-strong bg-surface px-3.5 py-2 text-xs font-medium text-dim rounded-xl">Open public page ↗</a>
          {canEdit(role) && <ReportActions slug={slug} reportId={r.id} />}
        </div>
      </div>
      <p className="text-xs text-muted mb-3">
        Anyone with the share link can view this report, including call transcripts and phone numbers. Revoke the link at any time.
        {narrative?._source ? ` Summary written by ${narrative._source}.` : ""}
      </p>
      {narrative?._unverified_numbers?.length ? (
        <p className="mb-4 bg-warn-bg text-warn text-xs px-3 py-2 rounded-xl">Check before sending: the summary mentions numbers we couldn&apos;t match to the data ({narrative._unverified_numbers.join(", ")}).</p>
      ) : null}
      <div className="border border-line -mx-4 sm:mx-0 rounded-2xl overflow-hidden">
        <ReportView snap={r.snapshot as ReportSnapshot} narrative={narrative} />
      </div>
    </>
  );
}
