import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { encodeFlac } from "../metrics/audio";
import { SAMPLE_RATE, type TimedTurn } from "./acoustics";
import { LISTEN_JSON_SCHEMA, LISTEN_SYSTEM, agentOnlyTrack, buildListenPrompt, parseListening } from "./listening";
import type { Listening } from "./schema";

/** Cheapest current Gemini model that listens to audio; override with GEMINI_MODEL. */
export const listenModel = () => process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
/** The listening check runs when a GEMINI_API_KEY is set (HUMANLIKE_LISTEN=off switches it off). */
export const listenAvailable = () => !!process.env.GEMINI_API_KEY?.trim() && process.env.HUMANLIKE_LISTEN !== "off";

// Gemini takes up to 20 MB per request inline; base64 adds a third, so keep the audio under ~14 MB.
const MAX_AUDIO_BYTES = 14 * 1024 * 1024;

function client() {
  // GEMINI_BASE_URL is only for local testing against a mock server; production always uses Google's API.
  const baseUrl = process.env.NODE_ENV !== "production" ? process.env.GEMINI_BASE_URL : undefined;
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim(), httpOptions: { timeout: 120_000, ...(baseUrl ? { baseUrl } : {}) } });
}

function friendly(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return "Gemini didn't accept the API key";
    if (e.status === 429) return "Gemini's usage limit was reached; it will retry on later calls";
    if (e.status === 400) return "Gemini couldn't process this recording";
    if (e.status >= 500) return "Gemini was unavailable";
  }
  return "the listening check failed";
}

/**
 * Sends the agent's side of the call to Gemini and returns what it heard. Returns null when there is
 * no usable audio, or a { error } note when the check was attempted but failed (never throws).
 */
export async function listenToAgent(pcm: Int16Array | null, turns: TimedTurn[]): Promise<Listening | null> {
  const track = agentOnlyTrack(pcm, turns);
  if (!track) return null;
  let audio: Buffer;
  try { audio = await encodeFlac(track.pcm, SAMPLE_RATE); } catch (e) {
    console.error("humanlike: audio encode failed", e);
    return { error: "the audio couldn't be prepared" };
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) return { error: "the call is too long for the listening check" };

  const model = listenModel();
  const ask = (thinking: boolean) => {
    const config: GenerateContentConfig = {
      systemInstruction: LISTEN_SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: LISTEN_JSON_SCHEMA,
      maxOutputTokens: 8192,
      ...(thinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
    };
    return client().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/flac", data: audio.toString("base64") } }, { text: buildListenPrompt(turns) }] }],
      config,
    });
  };
  try {
    const thinking = /^gemini-[34]/.test(model);
    let res;
    try { res = await ask(thinking); } catch (e) {
      // Older models don't take a thinking level: retry once without it.
      if (thinking && e instanceof ApiError && e.status === 400 && /thinking/i.test(e.message)) res = await ask(false);
      else throw e;
    }
    const u = res.usageMetadata;
    return parseListening(res.text ?? "", turns, res.modelVersion || model, {
      input: u?.promptTokenCount, output: u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : undefined,
    });
  } catch (e) {
    console.error("humanlike: listening check failed", e instanceof ApiError ? `${e.status} ${e.message.slice(0, 300)}` : e);
    return { error: friendly(e) };
  }
}
