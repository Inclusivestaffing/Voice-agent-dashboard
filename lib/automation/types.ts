import * as z from "zod/v4";
import { INBOX_REASONS, type InboxReason } from "../inbox/types";

/** Per-workspace Automation settings: which urgent things go to the inbox, and the scheduled analysis. */
export interface AutomationSettings {
  alerts: { threshold: number; reasons: Record<InboxReason, boolean> };
  schedule: { enabled: boolean; frequency: "daily" | "weekly"; /** 0 = Sunday … 6 = Saturday */ weekday: number };
  updated_at?: string;
}

export const DEFAULT_THRESHOLD = 90;

export const defaultSettings = (): AutomationSettings => ({
  alerts: { threshold: DEFAULT_THRESHOLD, reasons: Object.fromEntries(INBOX_REASONS.map((r) => [r, true])) as Record<InboxReason, boolean> },
  schedule: { enabled: false, frequency: "weekly", weekday: 1 },
});

/** Fill gaps in settings saved by an older version. */
export function normalizeSettings(s: Partial<AutomationSettings> | null | undefined): AutomationSettings {
  const d = defaultSettings();
  if (!s) return d;
  const threshold = Number(s.alerts?.threshold);
  return {
    alerts: {
      threshold: Number.isFinite(threshold) ? Math.max(0, Math.min(100, Math.round(threshold))) : d.alerts.threshold,
      reasons: Object.fromEntries(INBOX_REASONS.map((r) => [r, typeof s.alerts?.reasons?.[r] === "boolean" ? s.alerts.reasons[r] : true])) as Record<InboxReason, boolean>,
    },
    schedule: {
      enabled: !!s.schedule?.enabled,
      frequency: s.schedule?.frequency === "daily" ? "daily" : "weekly",
      weekday: Number.isInteger(s.schedule?.weekday) && s.schedule!.weekday >= 0 && s.schedule!.weekday <= 6 ? s.schedule!.weekday : d.schedule.weekday,
    },
    ...(s.updated_at ? { updated_at: s.updated_at } : {}),
  };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** What Claude returns for a scheduled analysis. */
export const DigestNarrative = z.object({
  headline: z.string().describe("One sentence for the top of the report: the single most important thing about this period."),
  health: z.enum(["good", "watch", "needs_attention"]).describe("good = working well; watch = some problems worth fixing; needs_attention = problems that are losing customers or mishandling callers."),
  summary: z.string().describe("3–4 sentences for the business owner: how the agent did, what went wrong most often, what to change first."),
  what_went_well: z.array(z.string()).describe("2–4 short points the agent handled well, each grounded in specific calls."),
  problems: z.array(z.object({
    title: z.string().describe("Short name of the problem, e.g. 'Asks for the name again after the caller gave it'."),
    detail: z.string().describe("What happens and why it matters, in 1–2 plain sentences."),
    how_often: z.string().describe("How many calls showed it, using the counts in the data, e.g. '6 of 41 calls'."),
    severity: z.enum(["high", "medium", "low"]),
    example_call_ids: z.array(z.string()).describe("Up to 3 call_id values from the data that show this problem."),
  })).describe("The recurring problems, most damaging first. Up to 5. Empty if there were none."),
  improvements: z.array(z.object({
    title: z.string().describe("The change, as an instruction, e.g. 'Gate transfers on business hours'."),
    why: z.string().describe("Which problem it fixes and the evidence, in 1–2 sentences."),
    change_type: z.enum(["prompt", "voice_setting", "knowledge_base", "tool_or_integration", "business_process"]),
    exact_change: z.string().describe("Exactly what to do: for a prompt change, the wording to paste and where it goes in the prompt; for a setting, which setting and its new value."),
    expected_impact: z.string().describe("What should get better, in one sentence."),
    example_call_ids: z.array(z.string()).describe("Up to 3 call_id values this would have helped."),
  })).describe("3–6 concrete improvements, most valuable first."),
  calls_to_review: z.array(z.object({
    call_id: z.string(),
    reason: z.string().describe("Why a person should listen to this call, in one sentence."),
  })).describe("Up to 8 calls a person should listen to, worst first."),
});
export type DigestNarrative = z.infer<typeof DigestNarrative>;

export interface DigestStats {
  calls: number;
  /** Calls with a real caller (not spam, voicemail, silent or errors). */
  conversations: number;
  analyzed: number;
  notAnalyzed: number;
  avgScore: number | null;
  threshold: number;
  belowThreshold: number;
  transferFails: number;
  negative: number;
  errors: number;
  unsuccessful: number;
  /** Calls the listening AI heard, and their average naturalness (1–5). */
  listened: number;
  avgMos: number | null;
  patterns: { label: string; count: number }[];
  topFixes: { fix: string; count: number }[];
  /** Transcripts actually sent for the analysis. */
  transcripts: number;
}

export interface CallRef { start_ts: string | null; score: number | null; summary: string | null }

export interface DigestRun {
  id: string;
  ws: string;
  wsName: string;
  status: "running" | "done" | "failed" | "skipped";
  trigger: "schedule" | "manual";
  frequency: "daily" | "weekly";
  period: { from: string; to: string };
  started_at: string;
  finished_at?: string;
  error?: string;
  note?: string;
  stats?: DigestStats;
  narrative?: DigestNarrative;
  /** "claude" = written by Claude; "rules" = numbers and per-call fixes only (no ANTHROPIC_API_KEY). */
  source?: "claude" | "rules";
  model?: string;
  usage?: { input_tokens: number; output_tokens: number; cost_usd: number };
  callRefs?: Record<string, CallRef>;
  sample?: boolean;
}
