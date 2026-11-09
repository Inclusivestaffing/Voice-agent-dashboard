import { notFound } from "next/navigation";
import { getWorkspace, listCalls } from "@/lib/db/queries";
import { parseFilters, filtersToQuery } from "@/lib/filters";
import type { CallRow } from "@/lib/types";
import CallDetailView from "@/components/call-detail/CallDetailView";
import { canEdit, ROLE_LABEL, isRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/;

export default async function CallDetail({ params, searchParams }: { params: Promise<{ slug: string; callId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug, callId } = await params;
  if (!CALL_ID.test(callId)) notFound();
  const sp = await searchParams;
  const { db, ws, role } = await getWorkspace(slug);
  const [{ data: call }, { data: metrics }, { data: analysis }] = await Promise.all([
    db.from("calls").select("*").eq("workspace_id", ws.id).eq("call_id", callId).maybeSingle<CallRow>(),
    db.from("call_metrics").select("*").eq("workspace_id", ws.id).eq("call_id", callId).maybeSingle(),
    db.from("call_analyses").select("*").eq("workspace_id", ws.id).eq("call_id", callId).maybeSingle(),
  ]);
  if (!call) notFound();

  // Prev / next within the same filtered, sorted list the user came from.
  const f = parseFilters(sp, ws.timezone);
  const sort = sp.sort ?? "start_ts";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const { rows } = await listCalls(db, ws.id, f, 0, 500, sort, dir);
  const idx = rows.findIndex((r) => r.call_id === callId);
  const nav = new URLSearchParams(filtersToQuery(f)); nav.set("sort", sort); nav.set("dir", dir);
  const link = (id: string) => `/w/${slug}/calls/${encodeURIComponent(id)}?${nav}`;

  return (
    <CallDetailView call={call} raw={call.raw} metrics={metrics} analysis={analysis} timezone={ws.timezone}
      agentName={ws.agent_display_name || call.agent_name || "Agent"} workspaceId={ws.id} canEdit={canEdit(role)}
      nav={{ back: `/w/${slug}/calls?${nav}`, prev: idx > 0 ? link(rows[idx - 1].call_id) : null, next: idx >= 0 && idx < rows.length - 1 ? link(rows[idx + 1].call_id) : null }} />
  );
}
