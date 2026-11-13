import Link from "next/link";
import { computeTiming } from "@/lib/metrics/timing";
import type { CallDiagnosis } from "@/lib/ai/schemas";
import type { RetellCall } from "@/lib/types";
import CallPlayer from "./CallPlayer";
import Diagnosis from "./Diagnosis";
import Chart from "@/components/charts/Chart";
import { Card, OutcomePill, SentimentText, fmtDate, fmtDur, fmtMoney, fmtMs, humanize, cx } from "@/components/ui";

export interface CallDetailCall {
  call_id: string; start_ts: string | null; duration_ms: number | null; direction: string | null; from_number: string | null; to_number: string | null;
  agent_name: string | null; agent_version: number | null; disconnection_reason: string | null; transfer_destination: string | null;
  user_sentiment: string | null; call_successful: boolean | null; in_voicemail: boolean | null; call_summary: string | null;
  custom_analysis: Record<string, unknown> | null; combined_cost_cents: number | null; recording_url: string | null;
  recording_multi_channel_url: string | null; public_log_url: string | null;
}

/** Full call-detail screen (header, synced player + transcript, AI diagnosis, timing, audio, latency, tools, cost, data). */
export default function CallDetailView({ call, raw, metrics, analysis, timezone, agentName, workspaceId, canEdit, nav }: {
  call: CallDetailCall; raw: RetellCall; metrics: Record<string, number | boolean | string | null> | null;
  analysis: { outcome?: string | null; analysis?: unknown; source?: string | null; overall_score?: number | null; model?: string | null } | null;
  timezone: string; agentName: string; workspaceId: string; canEdit: boolean;
  nav: { back: string; prev: string | null; next: string | null };
}) {
  const { segments, events } = computeTiming(raw);
  const d = (analysis?.analysis ?? null) as CallDiagnosis | null;
  const callId = call.call_id;
  const lat = raw.latency ?? {};
  const latencyRows = (["e2e", "llm", "tts", "asr", "knowledge_base", "s2s", "llm_websocket_network_rtt"] as const).filter((k) => lat[k]?.p50 != null);
  const turnLat = lat.e2e?.values ?? [];
  const tools = (raw.transcript_with_tool_calls ?? []).filter((e) => e.role === "tool_call_invocation" || e.role === "tool_call_result");
  const durationS = (call.duration_ms ?? 0) / 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = metrics as any;
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 text-xs">
        <Link href={nav.back} className="text-zinc-500 hover:text-zinc-900 font-medium inline-flex items-center gap-1 transition">
          ← Back to Call History
        </Link>
        <div className="flex items-center gap-1.5">
          {nav.prev ? (
            <Link href={nav.prev} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 transition">
              ← Prev
            </Link>
          ) : (
            <span className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-1.5 text-zinc-300 cursor-not-allowed">
              ← Prev
            </span>
          )}
          {nav.next ? (
            <Link href={nav.next} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 transition">
              Next →
            </Link>
          ) : (
            <span className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-1.5 text-zinc-300 cursor-not-allowed">
              Next →
            </span>
          )}
        </div>
      </div>

      <header className="border-b border-zinc-200/90 pb-4 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <OutcomePill outcome={analysis?.outcome} />
          {call.direction && (
            <span className="text-xs font-medium text-zinc-600 bg-zinc-100 border border-zinc-200 rounded-full px-2 py-0.5">
              {call.direction}
            </span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 mt-2">
          {d?.caller_intent ?? call.call_summary?.slice(0, 90) ?? "Call"}
        </h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-xs text-zinc-500">
          <span>{fmtDate(call.start_ts, timezone)}</span>
          <span>{call.from_number ?? "Web call"}{call.to_number ? ` → ${call.to_number}` : ""}</span>
          <span>{fmtDur(durationS)}</span>
          <span>{call.agent_name}{call.agent_version != null ? ` v${call.agent_version}` : ""}</span>
          <span>Ended: {humanize(call.disconnection_reason)}{call.transfer_destination ? ` → ${call.transfer_destination}` : ""}</span>
          <span>Mood: <SentimentText s={call.user_sentiment} /></span>
        </div>
      </header>

      <CallPlayer recordingUrl={call.recording_url} multiChannelUrl={call.recording_multi_channel_url} segments={segments} events={events} durationS={durationS} agentName={agentName}>
        <Diagnosis d={d} source={analysis?.source} score={analysis?.overall_score} model={analysis?.model} workspaceId={workspaceId} callId={callId} canEdit={canEdit} />
      </CallPlayer>

      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <Card title="Conversation timing" sub="From word timestamps">
          <Stats rows={[
            ["Time to first word", m?.time_to_first_word_s != null ? `${m.time_to_first_word_s}s` : "—", (m?.time_to_first_word_s ?? 0) > 2],
            ["Avg agent response gap", m?.avg_response_gap_s != null ? `${m.avg_response_gap_s}s` : "—", (m?.avg_response_gap_s ?? 0) > 1.5],
            ["Slowest response", m?.max_response_gap_s != null ? `${m.max_response_gap_s}s` : "—", (m?.max_response_gap_s ?? 0) > 3],
            ["Caller interruptions", m?.interruptions ?? "—", (m?.interruptions ?? 0) > 1],
            ["Agent talked over caller", m?.agent_interruptions ?? "—", (m?.agent_interruptions ?? 0) > 0],
            ["Dead air", m?.dead_air_pct != null ? `${Math.round(m.dead_air_pct * 100)}%` : "—", (m?.dead_air_pct ?? 0) > 0.3],
            ["Longest silence", m?.longest_silence_s != null ? `${m.longest_silence_s}s` : "—", (m?.longest_silence_s ?? 0) > 5],
            ["Overtalk", m?.overtalk_pct != null ? `${(m.overtalk_pct * 100).toFixed(1)}%` : "—", (m?.overtalk_pct ?? 0) > 0.05],
            ["Agent share of talking", m?.talk_ratio != null ? `${Math.round(m.talk_ratio * 100)}%` : "—", (m?.talk_ratio ?? 0) > 0.75],
            ["Longest agent monologue", m?.longest_agent_monologue_s != null ? `${m.longest_agent_monologue_s}s` : "—", (m?.longest_agent_monologue_s ?? 0) > 25],
            ["Repeated turns (loops)", m?.repetition_count ?? "—", (m?.repetition_count ?? 0) > 0],
            ["Turns", m?.turns ?? "—", false],
          ]} />
        </Card>
        <Card title="Audio analysis" sub="Voice activity on each channel of the recording">
          {m?.audio_analyzed ? (
            <Stats rows={[
              ["Caller speech detected", `${m.audio_user_speech_s}s`, (m.audio_user_speech_s ?? 0) < 0.3],
              ["Agent speech detected", `${m.audio_agent_speech_s}s`, false],
              ["Caller volume (peak)", `${m.audio_user_peak_db} dBFS`, (m.audio_user_peak_db ?? 0) < -35],
              ["Caller background noise", `${m.audio_user_noise_db} dBFS`, (m.audio_user_noise_db ?? -100) > -40],
              ["Clipping", `${m.audio_clipping_pct}%`, (m.audio_clipping_pct ?? 0) > 1],
            ]} />
          ) : <p className="text-sm text-dim">{m?.audio_error ? `Audio could not be analyzed: ${m.audio_error}` : "Audio not analyzed for this call."}</p>}
          <p className="text-xs text-muted mt-3">Silence on the caller channel means they never spoke. Speech there with no transcript means the agent failed to hear them.</p>
        </Card>
        <Card title="Latency breakdown" sub="Retell per-component latency (p50 / p90)">
          {latencyRows.length ? (
            <table className="w-full text-[12px]">
              <thead><tr className="text-left eyebrow"><th className="py-1">Component</th><th className="text-right">p50</th><th className="text-right">p90</th><th className="text-right">max</th></tr></thead>
              <tbody>{latencyRows.map((k) => (
                <tr key={k} className="border-t border-line"><td className="py-1.5">{({ e2e: "End to end", llm: "LLM", tts: "Text to speech", asr: "Speech to text", knowledge_base: "Knowledge base", s2s: "Speech-to-speech", llm_websocket_network_rtt: "Custom LLM network" } as Record<string, string>)[k]}</td>
                  <td className={cx("text-right", k === "e2e" && (lat[k]!.p50 ?? 0) > 1500 && "text-bad font-medium")}>{fmtMs(lat[k]!.p50)}</td><td className="text-right">{fmtMs(lat[k]!.p90)}</td><td className="text-right">{fmtMs(lat[k]!.max)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-dim">No latency data.</p>}
          {turnLat.length > 1 && (
            <div className="mt-3">
              <div className="eyebrow mb-1">End-to-end latency per turn</div>
              <Chart kind="column" unit="ms" labels="none" height={140} ariaLabel="Latency per turn" categories={turnLat.map((_, i) => `Turn ${i + 1}`)} series={[{ name: "Latency", data: turnLat, color: "--s1" }]} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <Card title="Tool calls" sub={`${m?.tool_calls ?? 0} calls · ${m?.tool_failures ?? 0} failed`}>
          {tools.length ? (
            <ol className="space-y-2 text-[12px] max-h-72 overflow-y-auto">
              {tools.map((t, i) => (
                <li key={i} className={cx("border-l-2 pl-2", t.role === "tool_call_invocation" ? "border-ink" : /error|fail/i.test(String(t.content ?? "")) || t.successful === false ? "border-bad" : "border-line-strong")}>
                  <span className="font-medium">{t.role === "tool_call_invocation" ? `→ ${t.name}` : "← result"}</span>
                  <div className="text-dim break-all">{String(t.role === "tool_call_invocation" ? t.arguments ?? "" : t.content ?? "").slice(0, 400)}</div>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-dim">The agent didn&apos;t call any tools.</p>}
        </Card>
        <Card title="Cost" sub={`Total ${fmtMoney(call.combined_cost_cents)}`}>
          <table className="w-full text-[12px]">
            <tbody>
              {(raw.call_cost?.product_costs ?? []).map((p, i) => (
                <tr key={i} className="border-t border-line first:border-0"><td className="py-1.5">{humanize(p.product)}{p.is_transfer_leg_cost ? " (transfer leg)" : ""}</td><td className="text-right">{fmtMoney(p.cost)}</td></tr>
              ))}
            </tbody>
          </table>
          {raw.llm_token_usage?.average != null && <p className="text-xs text-muted mt-3">LLM tokens: avg {Math.round(raw.llm_token_usage.average)} per request × {raw.llm_token_usage.num_requests} requests</p>}
        </Card>
        <Card title="Retell's analysis">
          <dl className="text-[12px] space-y-1.5">
            <div className="flex justify-between"><dt className="text-dim">Call successful</dt><dd className="font-medium">{call.call_successful == null ? "—" : call.call_successful ? "Yes" : "No"}</dd></div>
            <div className="flex justify-between"><dt className="text-dim">Sentiment</dt><dd><SentimentText s={call.user_sentiment} /></dd></div>
            <div className="flex justify-between"><dt className="text-dim">Voicemail</dt><dd>{call.in_voicemail ? "Yes" : "No"}</dd></div>
          </dl>
          {call.call_summary && <p className="text-[12px] mt-3 leading-relaxed">{call.call_summary}</p>}
          {call.custom_analysis && Object.keys(call.custom_analysis).length > 0 && (
            <dl className="mt-3 text-[12px] space-y-1 border-t border-line pt-3">
              {Object.entries(call.custom_analysis).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-dim">{humanize(k)}</dt><dd className="text-right font-semibold break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></div>
              ))}
            </dl>
          )}
          {call.public_log_url && <a href={call.public_log_url} target="_blank" rel="noreferrer" className="block mt-3 text-xs underline">Open Retell debug log ↗</a>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <Card title="Data" sub="Dynamic variables and metadata (as in Retell's call detail)">
          <KeyValues title="Dynamic variables" obj={{ ...(raw.retell_llm_dynamic_variables ?? {}), ...(raw.collected_dynamic_variables ?? {}) }} />
          <KeyValues title="Metadata" obj={raw.metadata ?? {}} />
        </Card>
        <Card title="Identifiers">
          <dl className="text-[12px] space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-dim">Session ID</dt><dd className="break-all text-right">{raw.call_id}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Agent ID</dt><dd className="break-all text-right">{raw.agent_id ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Channel type</dt><dd>{raw.call_type === "web_call" ? "Web call" : "Phone call"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Call status</dt><dd>{humanize(raw.call_status)}</dd></div>
          </dl>
        </Card>
      </div>

    </>
  );
}

function KeyValues({ title, obj }: { title: string; obj: Record<string, unknown> }) {
  const entries = Object.entries(obj);
  return (
    <div className="mb-3 last:mb-0">
      <div className="eyebrow mb-1">{title}</div>
      {entries.length ? (
        <dl className="text-[12px] space-y-1">{entries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><dt className="text-dim">{k}</dt><dd className="text-right break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></div>
        ))}</dl>
      ) : <p className="text-[12px] text-muted">None</p>}
    </div>
  );
}

function Stats({ rows }: { rows: [string, React.ReactNode, boolean][] }) {
  return (
    <dl className="text-[13px] divide-y divide-line">
      {rows.map(([k, v, bad]) => (
        <div key={k} className="flex justify-between py-1.5"><dt className="text-dim">{k}</dt><dd className={cx(" font-medium tabular", bad && "text-bad")}>{bad ? "▲ " : ""}{v}</dd></div>
      ))}
    </dl>
  );
}
