import "server-only";
import { decrypt, encrypt } from "../crypto";
import { hasServerStore, storeGet, storeMGet, storeSet } from "../live/store";
import type { HumanlikeStored } from "./schema";

/** Human-likeness results for connected Retell workspaces live in Vercel storage, encrypted. */
const key = (workspaceId: string, callId: string) => `va:hl:${workspaceId}:${callId}`;

function parse(raw: string | null | undefined): HumanlikeStored | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)) as HumanlikeStored; } catch { return null; }
}

export async function getHumanlike(workspaceId: string, callId: string): Promise<HumanlikeStored | null> {
  if (!hasServerStore()) return null;
  try { return parse(await storeGet(key(workspaceId, callId))); } catch { return null; }
}

/** Results for many calls at once (MGET in chunks). Missing calls are absent from the map. */
export async function getHumanlikeMany(workspaceId: string, callIds: string[]): Promise<Map<string, HumanlikeStored>> {
  const out = new Map<string, HumanlikeStored>();
  if (!hasServerStore() || !callIds.length) return out;
  for (let i = 0; i < callIds.length; i += 200) {
    const ids = callIds.slice(i, i + 200);
    try {
      const vals = await storeMGet(ids.map((id) => key(workspaceId, id)));
      (vals ?? []).forEach((v, j) => { const r = parse(v); if (r) out.set(ids[j], r); });
    } catch { /* storage hiccup: treat as not analyzed yet */ }
  }
  return out;
}

export async function saveHumanlike(workspaceId: string, r: HumanlikeStored) {
  await storeSet(key(workspaceId, r.call_id), encrypt(JSON.stringify(r)));
}
