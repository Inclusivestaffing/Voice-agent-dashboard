import * as z from "zod/v4";
import type { AcousticSummary } from "./acoustics";

export const HL_VERSION = 1;

export const MOMENT_CATEGORIES = [
  // robotic
  "monotone_voice", "rushed_or_dragging", "unnatural_pause", "slow_response", "instant_response", "talks_over_caller",
  "scripted_phrasing", "repetition", "robotic_readback", "abrupt_cutoff", "awkward_ending",
  // mistakes
  "ignored_caller", "wrong_information", "reasked_known_info", "misheard_caller", "no_empathy",
  // natural
  "natural_acknowledgement", "good_empathy", "natural_flow", "handled_interruption",
  "other",
] as const;
export type MomentCategory = (typeof MOMENT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<MomentCategory, string> = {
  monotone_voice: "Monotone voice", rushed_or_dragging: "Rushed or dragging", unnatural_pause: "Unnatural pause",
  slow_response: "Slow to respond", instant_response: "Answered impossibly fast", talks_over_caller: "Talked over the caller",
  scripted_phrasing: "Scripted phrasing", repetition: "Repeated itself", robotic_readback: "Robotic readback",
  abrupt_cutoff: "Cut off mid-sound", awkward_ending: "Awkward ending", ignored_caller: "Ignored what the caller said",
  wrong_information: "Wrong information", reasked_known_info: "Asked again for known details", misheard_caller: "Misheard the caller",
  no_empathy: "No empathy", natural_acknowledgement: "Natural acknowledgement", good_empathy: "Good empathy",
  natural_flow: "Natural flow", handled_interruption: "Handled an interruption well", other: "Other",
};

export const Moment = z.object({
  at_s: z.number().describe("Seconds into the call where the moment starts, taken from the transcript timestamps."),
  end_s: z.number().describe("Seconds into the call where it ends."),
  turn: z.number().int().describe("Transcript turn number [T#] it refers to, or -1."),
  kind: z.enum(["robotic", "mistake", "natural"]).describe("robotic = sounds machine-like; mistake = got something wrong or failed the caller; natural = a moment that sounded convincingly human."),
  category: z.enum(MOMENT_CATEGORIES),
  what: z.string().describe("What happened, in one plain-English sentence a business owner understands."),
  why: z.string().describe("Why it sounds robotic / is a mistake / sounds human, citing the measurement or words that show it."),
  fix: z.string().describe("A concrete change: exact prompt wording to add, or a voice/agent setting to adjust. Empty string for natural moments."),
});
export type Moment = z.infer<typeof Moment>;

/** What Claude returns. Scores 0–100, higher = more human / better. */
export const HumanlikeJudgement = z.object({
  subscores: z.object({
    voice: z.number().int().min(0).max(100).describe("How natural the voice sounds: pitch movement, pace, rhythm (use the acoustic measurements)."),
    timing: z.number().int().min(0).max(100).describe("Turn-taking: response delays, overtalk, interruptions, pauses."),
    flow: z.number().int().min(0).max(100).describe("Conversational flow: varied, natural phrasing vs scripted, repetitive or robotic readbacks."),
    listening: z.number().int().min(0).max(100).describe("Did it listen: acknowledged what was said, adapted, didn't re-ask known details, handled interruptions."),
    accuracy: z.number().int().min(0).max(100).describe("Correct information and correct handling of the caller's request."),
  }),
  verdict: z.string().describe("One short sentence: how human this agent sounded on this call."),
  summary: z.string().describe("2–3 sentences for the business owner: what made it sound human or robotic, and the biggest mistake if any."),
  moments: z.array(Moment).describe("4–12 key moments in time order, mixing robotic, mistake and natural moments as the call warrants."),
  top_fixes: z.array(z.string()).describe("Up to 3 changes that would most improve how human the agent sounds, most valuable first."),
});
export type HumanlikeJudgement = z.infer<typeof HumanlikeJudgement>;

export interface HumanlikeResult {
  version: number;
  call_id: string;
  analyzed_at: string;
  /** claude = full analysis; acoustic_only = no ANTHROPIC_API_KEY, measurements only; sample = demo data. */
  source: "claude" | "acoustic_only" | "sample";
  model?: string;
  score: number;
  label: string;
  subscores: { voice: number | null; timing: number | null; flow: number | null; listening: number | null; accuracy: number | null };
  verdict: string;
  summary: string;
  moments: Moment[];
  top_fixes: string[];
  acoustic: Omit<AcousticSummary, "sentences"> & { sentences: number };
  duration_s: number;
}

/** A call that couldn't be analyzed (too short, no transcript…), stored so it isn't retried forever. */
export interface HumanlikeSkip { version: number; call_id: string; skipped: true; reason: string; analyzed_at: string }

export type HumanlikeStored = HumanlikeResult | HumanlikeSkip;
export const isResult = (x: HumanlikeStored | null | undefined): x is HumanlikeResult => !!x && !("skipped" in x);

const WEIGHTS = { voice: 0.25, timing: 0.2, flow: 0.2, listening: 0.2, accuracy: 0.15 } as const;

/** Overall score: weighted mean of the sub-scores that exist. */
export function overallHumanScore(sub: HumanlikeResult["subscores"]): number {
  let sum = 0, w = 0;
  for (const [k, wt] of Object.entries(WEIGHTS) as [keyof typeof WEIGHTS, number][]) {
    const v = sub[k];
    if (v == null) continue;
    sum += v * wt; w += wt;
  }
  return w ? Math.round(sum / w) : 0;
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "Sounds human";
  if (score >= 70) return "Mostly natural";
  if (score >= 50) return "Noticeably robotic";
  return "Sounds robotic";
}
