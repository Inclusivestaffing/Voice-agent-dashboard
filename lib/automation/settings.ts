import "server-only";
import { decrypt, encrypt } from "../crypto";
import { hasServerStore, storeGet, storeSet } from "../live/store";
import { defaultSettings, normalizeSettings, type AutomationSettings } from "./types";

/** Automation settings per workspace live in Vercel storage (encrypted, like everything else). */
const cfgKey = (ws: string) => `va:auto:cfg:${ws}`;
const webhookKey = (ws: string) => `va:wh:last:${ws}`;

export async function getAutomationSettings(ws: string): Promise<AutomationSettings> {
  if (!hasServerStore()) return defaultSettings();
  try {
    const raw = await storeGet(cfgKey(ws));
    return normalizeSettings(raw ? (JSON.parse(decrypt(raw)) as Partial<AutomationSettings>) : null);
  } catch { return defaultSettings(); }
}

export async function saveAutomationSettings(ws: string, s: AutomationSettings) {
  await storeSet(cfgKey(ws), encrypt(JSON.stringify({ ...normalizeSettings(s), updated_at: new Date().toISOString() })));
}

/** When Retell last sent this workspace a webhook (proves instant alerts are wired up). */
export async function noteWebhook(ws: string) {
  if (hasServerStore()) await storeSet(webhookKey(ws), new Date().toISOString()).catch(() => {});
}
export async function lastWebhookAt(ws: string): Promise<string | null> {
  if (!hasServerStore()) return null;
  try { return await storeGet(webhookKey(ws)); } catch { return null; }
}
