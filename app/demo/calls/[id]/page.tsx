import { notFound } from "next/navigation";
import { filtersToQuery } from "@/lib/filters";
import { computeTiming } from "@/lib/metrics/timing";
import { filterDemo } from "@/lib/demo/openWater";
import { demoFilters } from "@/lib/demo/params";
import { getSource } from "@/lib/source";
import CallDetailView from "@/components/call-detail/CallDetailView";

export const dynamic = "force-dynamic";

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/;

export default async function DemoCallDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  if (!CALL_ID.test(id)) notFound();
  const sp = await searchParams;
  const src = await getSource();
  const found = await src.call(id);
  if (!found) notFound();
  const { row: c, raw } = found;
  const { f } = demoFilters(sp, `/demo/calls/${encodeURIComponent(id)}`, { live: src.live, timezone: src.timezone });
  const list = filterDemo(await src.calls(f.from, f.to).catch(() => []), f).sort((a, b) => (b.start_ts ?? "").localeCompare(a.start_ts ?? ""));
  const idx = list.findIndex((x) => x.call_id === id);
  const q = filtersToQuery(f);
  const link = (cid: string) => `/demo/calls/${cid}?${q}`;
  const timing = computeTiming(raw).metrics;

  return (
    <CallDetailView
      call={{
        ...c, to_number: c.to_number ?? null, transfer_destination: c.transfer_destination ?? null, custom_analysis: c.custom_analysis ?? null,
        recording_url: raw.recording_url ?? null, recording_multi_channel_url: raw.recording_multi_channel_url ?? null, public_log_url: raw.public_log_url ?? null,
      }}
      raw={raw}
      metrics={c.duration_ms == null ? null : { ...timing, audio_analyzed: false, audio_error: src.live ? "Audio analysis runs in database-backed workspaces." : "Demo data has no recording." }}
      analysis={c.analysis ? { outcome: c.outcome, analysis: c.analysis, source: c.overall_score == null ? "rules" : "llm", overall_score: c.overall_score, model: "claude-sonnet-5-5" } : null}
      timezone={src.timezone} agentName={c.agent_name ?? src.agentName ?? "Agent"} workspaceId="demo" canEdit={false}
      nav={{ back: `/demo/calls?${q}`, prev: idx > 0 ? link(list[idx - 1].call_id) : null, next: idx >= 0 && idx < list.length - 1 ? link(list[idx + 1].call_id) : null }} />
  );
}
