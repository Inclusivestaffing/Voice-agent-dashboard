import * as z from "zod/v4";
import { OUTCOMES, ROOT_CAUSES } from "../types";

export const PROMPT_VERSION = "call-diagnosis-v1";
export const CALL_MODEL = "claude-sonnet-5-5";
export const REPORT_MODEL = "claude-opus-5-5";

const Evidence = z.object({
  point: z.string().describe("One plain-English sentence a business owner understands."),
  turn: z.number().int().describe("Turn number from the transcript ([T#]) that shows this. Use -1 if not tied to a turn."),
  at_s: z.number().describe("Seconds into the call where this happens, from the transcript timestamps. Use -1 if unknown."),
});

export const CallDiagnosis = z.object({
  outcome: z.enum(OUTCOMES).describe("Business outcome of the call."),
  caller_intent: z.string().describe("What the caller wanted, in a short phrase, e.g. 'Book a winterization drop-off'."),
  intent_category: z.string().describe("Short reusable category, e.g. 'repair booking', 'rental inquiry', 'pricing', 'emergency', 'existing appointment', 'sales', 'other'."),
  success: z.boolean().describe("Did the caller get what they needed, judged against the workspace's success definition?"),
  success_reason: z.string().describe("One sentence explaining the success verdict."),
  plain_english_summary: z.string().describe("2-3 sentences: what happened and how it ended, written for the business owner."),
  what_worked: z.array(Evidence).describe("Specific things the agent did well. Empty if nothing notable."),
  what_failed: z.array(Evidence).describe("Specific things that went wrong or hurt the caller experience. Empty if nothing went wrong."),
  root_causes: z.array(z.enum(ROOT_CAUSES)).describe("Every distinct cause of problems on this call, most important first. ['none'] if the call went well."),
  primary_root_cause: z.enum(ROOT_CAUSES),
  severity: z.enum(["none", "low", "medium", "high", "critical"]).describe("critical = lost a customer or mishandled an emergency; high = clear failure; medium = friction; low = polish."),
  recommended_fix: z.string().describe("The single most valuable concrete change: exact prompt wording to add/change, a tool/integration to connect, or a setting to adjust. 'None needed' if the call went well."),
  prompt_change_suggestion: z.string().describe("If the fix is a prompt change, the exact text to add to the agent prompt; otherwise empty string."),
  scorecard: z.object({
    intent_understanding: z.number().int().min(1).max(5),
    information_accuracy: z.number().int().min(1).max(5),
    flow_efficiency: z.number().int().min(1).max(5),
    tone_and_empathy: z.number().int().min(1).max(5),
    task_completion: z.number().int().min(1).max(5),
    instruction_compliance: z.number().int().min(1).max(5),
  }).describe("1 = very poor, 3 = acceptable, 5 = excellent."),
  captured: z.object({
    caller_name: z.string(),
    callback_number: z.string(),
    appointment: z.string(),
    other_details: z.string(),
  }).describe("Details the agent collected. Empty strings when not collected."),
  followup_required: z.boolean().describe("Does a human need to follow up with this caller?"),
  followup_note: z.string().describe("What the human should do, or empty string."),
});
export type CallDiagnosis = z.infer<typeof CallDiagnosis>;

export const ReportNarrative = z.object({
  headline: z.string().describe("One sentence for the top banner, e.g. 'In 5 weeks, your AI receptionist answered 44 calls and spent 45.7 minutes on the phone.'"),
  what_worked: z.array(z.string()).describe("3-5 bullets. Each starts with a bolded-able short phrase then detail. Use only numbers from the snapshot."),
  what_needs_fixing: z.array(z.string()).describe("3-5 bullets, most impactful first. Use only numbers from the snapshot."),
  recommended_actions: z.array(z.object({
    action: z.string(),
    why: z.string(),
    expected_impact: z.string(),
  })).describe("3-5 prioritized, concrete changes to the agent, integrations or business process."),
  bottom_line: z.string().describe("One sentence summarizing customer-call success."),
  chart_insights: z.object({
    outcomes: z.string(),
    transfers: z.string(),
    sentiment: z.string(),
    disconnections: z.string(),
    by_day: z.string(),
    by_hour: z.string(),
    duration: z.string(),
    conversation_quality: z.string(),
  }).describe("One or two sentences of plain-English insight under each chart."),
});
export type ReportNarrative = z.infer<typeof ReportNarrative>;
