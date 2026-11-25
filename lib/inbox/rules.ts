import { isResult, type HumanlikeStored } from "../humanlike/schema";
import type { RetellCall } from "../types";
import type { AutomationSettings } from "../automation/types";
import { REASON_LABEL, type InboxReason, type InboxSeverity } from "./types";

/** The Retell facts about a call that decide whether it's urgent. Works for list rows and full calls. */
export interface CallSignals {
  call_id: string;
  start_ts: string | null;
  duration_ms: number | null;
  call_status: string | null;
  disconnection_reason: string | null;
  user_sentiment: string | null;
  call_successful: boolean | null;
  in_voicemail: boolean | null;
  outcome: string | null;
  call_summary: string | null;
  /** A transfer tool ran during the call (only known from the full call). */
  transfer_attempted?: boolean;
}

const TRANSFERRED = new Set(["call_transfer", "transfer_bridged"]);
const NOT_A_CONVERSATION = new Set(["voicemail_reached", "marked_as_spam", "scam_detected", "ivr_reached"]);
const NOT_A_CONVERSATION_OUTCOME = new Set(["voicemail", "spam", "silent", "no_data"]);

/** Did the agent try to transfer (any tool whose name mentions "transfer")? */
export function transferAttempted(raw: Pick<RetellCall, "transcript_with_tool_calls">): boolean {
  return (raw.transcript_with_tool_calls ?? []).some((e) => e.role === "tool_call_invocation" && /transfer/i.test(String(e.name ?? "")));
}

/** Which enabled alerts this call triggers. */
export function callReasons(sig: CallSignals, hl: HumanlikeStored | null | undefined, alerts: AutomationSettings["alerts"]): InboxReason[] {
  const reason = sig.disconnection_reason ?? "";
  const isError = sig.call_status === "error" || reason.startsWith("error");
  const notConversation = !!sig.in_voicemail || NOT_A_CONVERSATION.has(reason) || NOT_A_CONVERSATION_OUTCOME.has(sig.outcome ?? "");
  const out: InboxReason[] = [];
  if (isError) out.push("error");
  if (sig.outcome === "transfer_fail" || reason === "transfer_cancelled" || (sig.transfer_attempted && !TRANSFERRED.has(reason))) out.push("transfer_fail");
  if (!notConversation && sig.user_sentiment === "Negative") out.push("negative");
  if (!notConversation && !isError && sig.call_successful === false && (sig.duration_ms ?? 0) > 10_000) out.push("unsuccessful");
  if (isResult(hl) && hl.score < alerts.threshold) out.push("low_quality");
  return out.filter((r) => alerts.reasons[r]);
}

export function severityOf(reasons: InboxReason[], score: number | null | undefined): InboxSeverity {
  const lowBy = (n: number) => reasons.includes("low_quality") && score != null && score < n;
  if (reasons.includes("error") || reasons.includes("transfer_fail") || lowBy(50)) return "critical";
  if (reasons.includes("negative") || lowBy(70)) return "high";
  return "medium";
}

const TITLE_ORDER: InboxReason[] = ["error", "transfer_fail", "negative", "low_quality", "unsuccessful"];

/** e.g. "Transfer failed · Quality 62/100" or "Upset caller · Quality 81/100 +1". */
export function titleOf(reasons: InboxReason[], score: number | null | undefined): string {
  const parts = TITLE_ORDER.filter((r) => reasons.includes(r)).map((r) => (r === "low_quality" && score != null ? `Quality ${score}/100` : REASON_LABEL[r]));
  return parts.slice(0, 2).join(" · ") + (parts.length > 2 ? ` +${parts.length - 2}` : "");
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** One plain line about what happened, plus the most useful fix when the analysis has one. */
export function detailOf(sig: CallSignals, hl: HumanlikeStored | null | undefined, reasons: InboxReason[]): { detail: string; fix?: string } {
  const r = isResult(hl) ? hl : null;
  const pick = reasons.includes("low_quality") && r?.verdict ? r.verdict : sig.call_summary || r?.summary || "";
  const reasonText = sig.disconnection_reason?.startsWith("error") ? `Ended with ${sig.disconnection_reason.replace(/_/g, " ")}.` : "";
  const detail = clip((pick || reasonText || "Open the call to see what happened.").trim(), 240);
  const mistake = r?.moments.find((m) => m.kind === "mistake" && m.fix) ?? r?.moments.find((m) => m.kind === "robotic" && m.fix);
  const fix = r?.top_fixes[0] || mistake?.fix || "";
  return fix ? { detail, fix: clip(fix, 240) } : { detail };
}
