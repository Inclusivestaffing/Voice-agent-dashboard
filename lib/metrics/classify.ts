// Rule-based pre-classification. Handles the obvious cases (silent hangups,
// robocalls, voicemail, missing data) deterministically so we don't pay an LLM
// to tell us a 4-second call with no caller speech was a silent hangup.

import type { RetellCall, Outcome, RootCause } from "../types";
import type { TimingMetrics } from "./timing";

export interface RuleResult {
  outcome: Outcome;
  root_cause: RootCause;
  reason: string;
  what_failed: string[];
  recommended_fix: string;
}

const ROBOCALL_RE = /(press (nine|9|one|1)|do not call list|this offer expires|equipment financing|to decline this offer|have a blessed day|your (car'?s )?extended warranty|this is an automated|para español)/i;

export function userText(call: Pick<RetellCall, "transcript_object" | "transcript">): string {
  if (call.transcript_object?.length) {
    return call.transcript_object.filter((u) => u.role === "user").map((u) => u.content).join(" ").trim();
  }
  return (call.transcript || "")
    .split("\n")
    .filter((l) => l.startsWith("User:"))
    .map((l) => l.slice(5))
    .join(" ")
    .trim();
}

export function preClassify(
  call: RetellCall,
  timing: TimingMetrics | null,
  audio?: { user_speech_s: number | null } | null,
): RuleResult | null {
  const durationS = (call.duration_ms ?? 0) / 1000;
  const said = userText(call);
  const saidWords = said.split(/\s+/).filter(Boolean).length;

  if (call.call_status === "not_connected" || call.call_status === "error" ||
      (!call.transcript && !call.transcript_object?.length && !call.call_analysis?.call_summary)) {
    return {
      outcome: "no_data",
      root_cause: call.disconnection_reason?.startsWith("error") ? "audio_quality" : "none",
      reason: `No conversation was recorded (status: ${call.call_status ?? "unknown"}, ended: ${call.disconnection_reason ?? "unknown"}).`,
      what_failed: call.disconnection_reason?.startsWith("error")
        ? [`The call ended with a system error (${call.disconnection_reason}).`]
        : [],
      recommended_fix: call.disconnection_reason?.startsWith("error")
        ? "Check the Retell public log for this call and the telephony/LLM connection; repeated errors should be raised with Retell support."
        : "Nothing to fix — the call never connected to a conversation.",
    };
  }

  if (call.call_analysis?.in_voicemail || call.disconnection_reason === "voicemail_reached") {
    return {
      outcome: "voicemail", root_cause: "none",
      reason: "The call reached a voicemail box.",
      what_failed: [], recommended_fix: "None for inbound. For outbound campaigns, tune retry timing or leave a short voicemail message.",
    };
  }

  if (ROBOCALL_RE.test(said) || call.disconnection_reason === "ivr_reached" || call.disconnection_reason === "marked_as_spam" || call.disconnection_reason === "scam_detected") {
    return {
      outcome: "spam", root_cause: "spam_or_abuse",
      reason: "The caller was an automated system or sales robocall, not a customer.",
      what_failed: [],
      recommended_fix: "Optional: add these numbers to a block list, or instruct the agent to end calls quickly when it detects an automated message.",
    };
  }

  const audioSilent = audio && audio.user_speech_s !== null && audio.user_speech_s < 0.3;
  if (durationS > 0 && durationS <= 12 && (saidWords === 0 || audioSilent) && !(timing?.user_spoke && saidWords > 2)) {
    const hungDuringGreeting = timing?.time_to_first_word_s != null && timing.time_to_first_word_s > 1.5;
    return {
      outcome: "silent",
      root_cause: hungDuringGreeting ? "latency" : "caller_dropped",
      reason: `The caller hung up after ${durationS.toFixed(0)}s without saying anything${audioSilent ? " (no speech detected on the caller's audio channel)" : ""}.`,
      what_failed: hungDuringGreeting
        ? [`The greeting started ${timing!.time_to_first_word_s!.toFixed(1)}s into the call — callers may hang up thinking nobody answered.`]
        : ["The caller left before engaging with the agent."],
      recommended_fix: hungDuringGreeting
        ? "Shorten the time before the greeting (reduce begin-message delay) and keep the opening line under 4 seconds."
        : "Usually a misdial or a caller surprised by an AI. Keep the greeting short and natural; if this is frequent, test the greeting audio on a real phone line.",
    };
  }

  return null;
}
