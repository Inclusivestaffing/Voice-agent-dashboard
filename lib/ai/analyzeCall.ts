import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CALL_MODEL, CallDiagnosis } from "./schemas";
import { CALL_SYSTEM_PROMPT, buildCallUserPrompt } from "./prompts";
import type { RetellCall } from "../types";
import type { Segment, TimingMetrics, TimelineEvent } from "../metrics/timing";
import type { AudioMetrics } from "../metrics/audio";

let _client: Anthropic | null = null;
export function anthropic() {
  return (_client ??= new Anthropic({ maxRetries: 3 }));
}

export interface AnalyzeInput {
  call: RetellCall;
  segments: Segment[];
  timing: TimingMetrics;
  events: TimelineEvent[];
  audio: AudioMetrics | null;
  agentPrompt: string | null;
  successDefinition: string;
  businessHours: string;
}

/** System blocks: stable instructions + the agent's own prompt, cached per agent. */
function systemBlocks(agentPrompt: string | null): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: CALL_SYSTEM_PROMPT },
    {
      type: "text",
      text: `<agent_intended_behaviour>\n${agentPrompt?.trim() || "The agent's prompt was not available. Judge against the success definition and common receptionist best practice."}\n</agent_intended_behaviour>`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

export function overallScore(d: CallDiagnosis): number {
  const vals = Object.values(d.scorecard);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(((avg - 1) / 4) * 100);
}

/** Real-time analysis of one call with Claude Sonnet 5.5 (structured output). */
export async function analyzeCall(input: AnalyzeInput) {
  const response = await anthropic().beta.messages.parse({
    model: CALL_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(CallDiagnosis) },
    system: systemBlocks(input.agentPrompt),
    messages: [{ role: "user", content: buildCallUserPrompt(input) }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`Analysis declined: ${response.stop_details?.explanation ?? "safety refusal"}`);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error(`Analysis incomplete (stop_reason=${response.stop_reason})`);
  }
  return {
    diagnosis: response.parsed_output,
    model: response.model,
    usage: response.usage,
  };
}

/** Request params for the Message Batches API (50% cheaper; used for backfills). */
export function batchRequestParams(input: AnalyzeInput): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model: CALL_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(CallDiagnosis) },
    system: systemBlocks(input.agentPrompt) as Anthropic.Messages.TextBlockParam[],
    messages: [{ role: "user", content: buildCallUserPrompt(input) }],
  };
}

export function parseDiagnosisText(message: Anthropic.Messages.Message): CallDiagnosis {
  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text block in batch result");
  return CallDiagnosis.parse(JSON.parse(text.text));
}
