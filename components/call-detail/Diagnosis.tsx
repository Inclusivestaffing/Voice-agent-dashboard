"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CallDiagnosis } from "@/lib/ai/schemas";
import { ROOT_CAUSE_LABEL, type RootCause } from "@/lib/types";
import { SeekTime } from "./CallPlayer";
import { OutcomePill, Button, cx } from "../ui";
import { reanalyzeCall } from "@/app/actions";

const SCORE_LABEL: Record<string, string> = {
  intent_understanding: "Understood the caller",
  information_accuracy: "Accurate information",
  flow_efficiency: "Efficient flow",
  tone_and_empathy: "Tone & empathy",
  task_completion: "Completed the task",
  instruction_compliance: "Followed instructions",
};

const SEVERITY: Record<string, string> = {
  none: "bg-good-bg text-good", low: "bg-surface-3 text-dim", medium: "bg-warn-bg text-warn",
  high: "bg-bad-bg text-bad", critical: "bg-bad text-white",
};

export default function Diagnosis({ d, source, score, model, workspaceId, callId, canEdit }: {
  d: CallDiagnosis | null; source?: string | null; score?: number | null; model?: string | null;
  workspaceId: string; callId: string; canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  const rerun = canEdit && (
    <Button variant="ghost" disabled={pending} onClick={() => start(async () => {
      try { await reanalyzeCall(workspaceId, callId); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    })}>{pending ? "Analyzing…" : d ? "Re-run analysis" : "Analyze now"}</Button>
  );

  if (!d) {
    return (
      <section className="bg-surface border border-line p-5 rounded-2xl">
        <h2 className="section-title mb-3">AI diagnosis</h2>
        <p className="text-sm text-dim mb-4">This call hasn&apos;t been analyzed yet. New calls are analyzed automatically within a few minutes.</p>
        {rerun}{err && <p className="text-bad text-xs mt-2">{err}</p>}
      </section>
    );
  }

  return (
    <>
      <section className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="bg-surface-2 border-b border-line px-5 py-4 text-ink">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">AI diagnosis</span>
            <div className="flex items-center gap-2">
              <span className={cx("px-2 py-0.5 text-xs font-medium rounded-lg", SEVERITY[d.severity])}>{d.severity === "none" ? "No issues" : `${d.severity} severity`}</span>
              {score != null && <span className="bg-ink text-white px-2 py-0.5 text-xs font-medium rounded-lg">{score}/100</span>}
            </div>
          </div>
          <p className="font-medium text-[15px] mt-2 leading-snug text-ink">{d.plain_english_summary}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="eyebrow">Caller wanted</div><div className="font-semibold mt-1">{d.caller_intent}</div></div>
            <div><div className="eyebrow">Outcome</div><div className="mt-1.5"><OutcomePill outcome={d.outcome} /></div></div>
            <div className="col-span-2">
              <div className="eyebrow">Did it work?</div>
              <div className={cx("mt-1 font-semibold", d.success ? "text-good" : "text-bad")}>{d.success ? "✓ Yes" : "✗ No"} <span className="font-normal text-ink">— {d.success_reason}</span></div>
            </div>
          </div>

          {d.what_worked.length > 0 && (
            <div>
              <div className="text-xs font-medium text-good mb-2">✓ Why it worked</div>
              <ul className="space-y-2">{d.what_worked.map((w, i) => (
                <li key={i} className="flex gap-2 items-start text-[13px] leading-relaxed"><span className="w-5 h-5 shrink-0 grid place-items-center bg-[var(--status-good)] text-white text-xs font-medium rounded-sm">✓</span><span className="flex-1">{w.point}</span><SeekTime at={w.at_s} /></li>
              ))}</ul>
            </div>
          )}
          {d.what_failed.length > 0 && (
            <div>
              <div className="text-xs font-medium text-bad mb-2">▲ What didn&apos;t work</div>
              <ul className="space-y-2">{d.what_failed.map((w, i) => (
                <li key={i} className="flex gap-2 items-start text-[13px] leading-relaxed"><span className="w-5 h-5 shrink-0 grid place-items-center bg-bad text-white text-xs font-medium rounded-sm">!</span><span className="flex-1">{w.point}</span><SeekTime at={w.at_s} /></li>
              ))}</ul>
            </div>
          )}

          {d.root_causes.filter((r) => r !== "none").length > 0 && (
            <div>
              <div className="eyebrow mb-1.5">Root causes</div>
              <div className="flex flex-wrap gap-1.5">{d.root_causes.filter((r) => r !== "none").map((r) => (
                <span key={r} className={cx("px-2 py-0.5 text-xs font-medium rounded-lg", r === d.primary_root_cause ? "bg-warn text-white" : "bg-warn-bg text-warn")}>{ROOT_CAUSE_LABEL[r as RootCause] ?? r}</span>
              ))}</div>
            </div>
          )}

          <div className="border-l-[3px] border-ink bg-surface-2 px-4 py-3 rounded-r-xl">
            <div className="eyebrow mb-1">Recommended fix</div>
            <p className="text-[13px] leading-relaxed">{d.recommended_fix}</p>
            {d.prompt_change_suggestion && (
              <div className="mt-3">
                <div className="flex items-center justify-between"><span className="eyebrow">Add to agent prompt</span>
                  <button className="text-xs underline" onClick={() => navigator.clipboard.writeText(d.prompt_change_suggestion)}>Copy</button></div>
                <pre className="mt-1 whitespace-pre-wrap text-[12px] bg-surface border border-line p-3 rounded-2xl">{d.prompt_change_suggestion}</pre>
              </div>
            )}
          </div>

          {d.followup_required && (
            <div className="border-l-[3px] border-bad bg-bad-bg px-4 py-3 text-[13px] rounded-r-xl"><b>Follow-up needed:</b> {d.followup_note}</div>
          )}
        </div>
      </section>

      {source === "llm" && (
        <section className="bg-surface border border-line p-5 rounded-2xl">
          <h2 className="section-title mb-3">Scorecard</h2>
          <div className="space-y-2.5">
            {Object.entries(d.scorecard).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[1fr_120px_24px] items-center gap-3 text-[13px]">
                <span>{SCORE_LABEL[k] ?? k}</span>
                <div className="flex gap-0.5" role="img" aria-label={`${v} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => <span key={n} className={cx("h-2.5 flex-1 rounded-[2px]", n <= v ? (v <= 2 ? "bg-bad" : v === 3 ? "bg-[var(--status-warning)]" : "bg-[var(--status-good)]") : "bg-surface-3")} />)}
                </div>
                <span className="font-medium text-right">{v}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(d.captured.caller_name || d.captured.callback_number || d.captured.appointment || d.captured.other_details) && (
        <section className="bg-surface border border-line p-5 rounded-2xl">
          <h2 className="section-title mb-3">Details captured</h2>
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[13px]">
            {d.captured.caller_name && <><dt className="text-dim">Name</dt><dd className="font-semibold">{d.captured.caller_name}</dd></>}
            {d.captured.callback_number && <><dt className="text-dim">Callback</dt><dd className="">{d.captured.callback_number}</dd></>}
            {d.captured.appointment && <><dt className="text-dim">Appointment</dt><dd>{d.captured.appointment}</dd></>}
            {d.captured.other_details && <><dt className="text-dim">Other</dt><dd>{d.captured.other_details}</dd></>}
          </dl>
        </section>
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{source === "rules" ? "Classified by rules (no AI needed)" : `Analyzed by ${model ?? "Claude"}`}</span>
        {rerun}
      </div>
      {err && <p className="text-bad text-xs">{err}</p>}
    </>
  );
}
