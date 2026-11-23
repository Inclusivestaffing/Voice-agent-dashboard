import "server-only";
import { decrypt, encrypt, encryptionKey } from "../crypto";
import { hasServerStore, storeDel, storeGet, storeSet, storeSetNx } from "../live/store";
import { applyFeedback, emptyCallFeedback, emptyWorkspaceFeedback, type CallFeedback, type FeedbackInput, type WorkspaceFeedback } from "./feedback";
import type { HumanlikeResult } from "./schema";

/** Feedback lives next to the results in Vercel storage, encrypted. Needs server storage. */
export const feedbackAvailable = () => hasServerStore() && encryptionKey() !== null;

const callKey = (ws: string, call: string) => `va:hlfb:${ws}:${call}`;
const wsKey = (ws: string) => `va:hlfb:${ws}`;
const lockKey = (ws: string) => `va:hlfb:lock:${ws}`;

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)) as T; } catch { return null; }
}

export async function getCallFeedback(wsId: string, callId: string): Promise<CallFeedback | null> {
  if (!feedbackAvailable()) return null;
  try { return parse<CallFeedback>(await storeGet(callKey(wsId, callId))) ?? emptyCallFeedback(); } catch { return null; }
}

export async function getWorkspaceFeedback(wsId: string): Promise<WorkspaceFeedback | null> {
  if (!feedbackAvailable()) return null;
  try { return parse<WorkspaceFeedback>(await storeGet(wsKey(wsId))) ?? emptyWorkspaceFeedback(); } catch { return null; }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Saves one change. The workspace roll-up is read-modify-written under a short lock so two quick
 * clicks can't lose a count. Returns the call's updated feedback, or null for an unknown moment.
 */
export async function saveFeedback(wsId: string, result: HumanlikeResult, input: FeedbackInput): Promise<CallFeedback | null> {
  let locked = false;
  for (let i = 0; i < 20 && !locked; i++) {
    locked = await storeSetNx(lockKey(wsId), "1", 10);
    if (!locked) await pause(150);
  }
  if (!locked) throw new Error("Busy, try again");
  try {
    const [call, ws] = await Promise.all([getCallFeedback(wsId, result.call_id), getWorkspaceFeedback(wsId)]);
    const next = applyFeedback(result, call ?? emptyCallFeedback(), ws ?? emptyWorkspaceFeedback(), input);
    if (!next) return null;
    await Promise.all([
      storeSet(callKey(wsId, result.call_id), encrypt(JSON.stringify(next.call))),
      storeSet(wsKey(wsId), encrypt(JSON.stringify(next.ws))),
    ]);
    return next.call;
  } finally {
    await storeDel(lockKey(wsId)).catch(() => {});
  }
}
