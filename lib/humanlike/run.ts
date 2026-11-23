import "server-only";
import { decodeStereo } from "../metrics/audio";
import { liveCall } from "../live/retell";
import { hasServerStore, storeDel, storeIncr, storeSetNx } from "../live/store";
import type { LiveWorkspace } from "../live/conn";
import { analyzeAgentVoice, timedTurns } from "./acoustics";
import { judgeHumanlike } from "./analyze";
import { listenAvailable, listenToAgent } from "./listen";
import { getHumanlike, getHumanlikeMany, saveHumanlike } from "./store";
import { getWorkspaceFeedback } from "./feedbackStore";
import { calibrationNotes } from "./feedback";
import { HL_VERSION, type HumanlikeStored } from "./schema";

const DAILY_CAP = Number(process.env.HUMANLIKE_DAILY_CAP || 500);
const MIN_CALL_S = 10;

/**
 * Analyze one call of a connected workspace (once): fetch the full call from Retell, measure the
 * agent's voice from the recording, have Gemini listen to it (when GEMINI_API_KEY is set), ask
 * Claude for the judgement (when ANTHROPIC_API_KEY is set), store the result encrypted.
 * Safe to call repeatedly: a lock prevents duplicate work and finished calls are skipped.
 */
export async function analyzeLiveCall(ws: LiveWorkspace, callId: string): Promise<HumanlikeStored | null> {
  if (!hasServerStore() || !/^[A-Za-z0-9_-]{1,128}$/.test(callId)) return null;
  const existing = await getHumanlike(ws.id, callId);
  if (existing) return existing;
  const lock = `va:hl:lock:${ws.id}:${callId}`;
  if (!(await storeSetNx(lock, "1", 300))) return null; // another run is on it
  try {
    const day = new Date().toISOString().slice(0, 10);
    if ((await storeIncr(`va:hl:count:${ws.id}:${day}`, 2 * 86400)) > DAILY_CAP) return null;

    const raw = await liveCall(ws, callId);
    if (!raw) return null;
    if (raw.call_status !== "ended") return null; // try again once the call is over
    const turns = timedTurns(raw.transcript_object);
    const durationS = (raw.duration_ms ?? 0) / 1000;
    const skip = (reason: string): HumanlikeStored => ({ version: HL_VERSION, call_id: callId, skipped: true, reason, analyzed_at: new Date().toISOString() });
    let result: HumanlikeStored;
    if (durationS < MIN_CALL_S) result = skip("Call too short to judge.");
    else if (turns.filter((t) => t.role === "agent").length < 2) result = skip("Not enough agent speech in the transcript.");
    else {
      const url = raw.recording_multi_channel_url || raw.recording_url;
      let pcm: Int16Array | null = null;
      if (url && durationS <= 1800) {
        try { pcm = await decodeStereo(url); } catch (e) { console.error("humanlike: decode failed", callId, e); }
      }
      const acoustic = analyzeAgentVoice(pcm, turns);
      // Gemini listens to the agent's voice first, so Claude can use what it heard.
      const listening = listenAvailable() ? await listenToAgent(pcm, turns) : null;
      const calibration = calibrationNotes(await getWorkspaceFeedback(ws.id).catch(() => null));
      result = await judgeHumanlike(raw, acoustic, raw.agent_name ?? null, calibration, listening);
    }
    await saveHumanlike(ws.id, result);
    return result;
  } catch (e) {
    console.error("humanlike: analysis failed", callId, e);
    return null;
  } finally {
    await storeDel(lock).catch(() => {});
  }
}

/** Background catch-up: analyze up to `max` not-yet-analyzed calls, newest first, within a time budget. */
export async function sweepLive(ws: LiveWorkspace, callIds: string[], opts: { max?: number; budgetMs?: number } = {}) {
  if (!hasServerStore() || !callIds.length) return { analyzed: 0 };
  const started = Date.now();
  const have = await getHumanlikeMany(ws.id, callIds);
  const todo = callIds.filter((id) => !have.has(id)).slice(0, opts.max ?? 10);
  let analyzed = 0;
  for (const id of todo) {
    if (Date.now() - started > (opts.budgetMs ?? 50_000)) break;
    if (await analyzeLiveCall(ws, id)) analyzed++;
  }
  return { analyzed, pending: todo.length - analyzed };
}
