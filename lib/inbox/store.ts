import "server-only";
import { decrypt, encrypt } from "../crypto";
import { hasServerStore, storeDel, storeGet, storeLPush, storeLRange, storeLRem, storeLTrim, storeMGet, storeSetEx, storeSetNx } from "../live/store";
import type { InboxItem } from "./types";

/**
 * One inbox for the whole account (every workspace), in Vercel storage. Each item is encrypted
 * under its own key; a list holds the ids newest first. Items expire after 90 days and the list
 * keeps the newest 500.
 */
const LIST = "va:inbox:list:v1";
const itemKey = (id: string) => `va:inbox:item:${id}`;
const TTL_S = 90 * 86400;
const MAX = 500;
export const ITEM_ID = /^[cds]:(sample|ws_[a-z0-9]{1,24}):[A-Za-z0-9_-]{1,128}$/;

export const inboxAvailable = () => hasServerStore();

function parse(raw: string | null | undefined): InboxItem | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)) as InboxItem; } catch { return null; }
}
const write = (it: InboxItem) => storeSetEx(itemKey(it.id), encrypt(JSON.stringify(it)), TTL_S);

export async function getInboxItem(id: string): Promise<InboxItem | null> {
  if (!hasServerStore() || !ITEM_ID.test(id)) return null;
  try { return parse(await storeGet(itemKey(id))); } catch { return null; }
}

/** Newest items first. Ids whose item expired are skipped. */
export async function listInbox(limit = 100): Promise<InboxItem[]> {
  if (!hasServerStore()) return [];
  try {
    const ids = [...new Set(await storeLRange(LIST, 0, Math.min(limit, MAX) - 1))];
    if (!ids.length) return [];
    const vals = await storeMGet(ids.map(itemKey));
    return (vals ?? []).map(parse).filter((x): x is InboxItem => !!x);
  } catch { return []; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Add an item, or merge into the existing one with the same id: new reasons are added, the text is
 * refreshed, and an item that gains a new reason becomes unread again. Returns the saved item, or
 * null when nothing changed.
 */
export async function upsertInbox(next: Omit<InboxItem, "created_at" | "updated_at" | "read_at">): Promise<InboxItem | null> {
  if (!hasServerStore() || !ITEM_ID.test(next.id)) return null;
  const lock = `va:inbox:lock:${next.id}`;
  let locked = false;
  for (let i = 0; i < 6 && !(locked = await storeSetNx(lock, "1", 15)); i++) await sleep(250);
  if (!locked) return null; // someone else is writing this item right now; the next sweep catches up
  try {
    const now = new Date().toISOString();
    const prev = await getInboxItem(next.id);
    if (!prev) {
      const it: InboxItem = { ...next, created_at: now, updated_at: now, read_at: null };
      await write(it);
      await storeLPush(LIST, it.id);
      await storeLTrim(LIST, 0, MAX - 1);
      return it;
    }
    const added = next.reasons.filter((r) => !prev.reasons.includes(r));
    const same = !added.length && prev.title === next.title && prev.detail === next.detail && prev.fix === next.fix && prev.score === next.score;
    if (same) return null;
    const it: InboxItem = {
      ...prev, ...next,
      reasons: [...prev.reasons, ...added],
      created_at: prev.created_at, updated_at: now,
      read_at: added.length ? null : prev.read_at,
    };
    await write(it);
    if (added.length) { await storeLRem(LIST, it.id); await storeLPush(LIST, it.id); await storeLTrim(LIST, 0, MAX - 1); } // bump to the top
    return it;
  } finally {
    await storeDel(lock).catch(() => {});
  }
}

/** Mark items read (or unread). */
export async function setRead(ids: string[], read = true) {
  if (!hasServerStore()) return 0;
  let n = 0;
  for (const id of ids.filter((x) => ITEM_ID.test(x)).slice(0, 500)) {
    const it = await getInboxItem(id);
    if (!it || !!it.read_at === read) continue;
    await write({ ...it, read_at: read ? new Date().toISOString() : null });
    n++;
  }
  return n;
}
