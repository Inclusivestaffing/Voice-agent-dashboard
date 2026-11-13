import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { decrypt, encrypt, encryptionKey } from "../crypto";
import { hasServerStore, storeDel, storeGet, storeSet } from "./store";
import { isSignedIn, passwordConfigured } from "../auth/gate";

/**
 * Workspaces created in the app. Each one is a Retell connection (API key + chosen agents) with a
 * name and time zone. The whole list is AES-256-GCM encrypted.
 *
 * Where it lives:
 *  - "server": in the project's Vercel storage (Upstash Redis), shared by every device. Requires
 *    APP_PASSWORD, and only signed-in viewers can read it.
 *  - "browser": in an httpOnly cookie for this browser only (local development).
 *
 * The built-in sample workspace (Open Water Marine) always exists and isn't stored. Which workspace
 * a browser is looking at is kept in a small cookie.
 */
export interface LiveConn {
  apiKey: string;
  agentIds: string[];   // empty = every agent in the Retell account
  name: string;         // business / workspace name shown in the app
  timezone: string;
  connectedAt: string;
}
export interface LiveWorkspace extends LiveConn { id: string }

export const SAMPLE_ID = "sample";
const LIST_COOKIE = "va_workspaces";
const ACTIVE_COOKIE = "va_ws";
const STORE_KEY = "va:workspaces:v1";
const LEGACY_STORE_KEY = "va:retell-connection:v1";
const LEGACY_COOKIE = "retell_conn";
const MAX_AGE = 60 * 60 * 24 * 365;
const MAX_WORKSPACES = 25;

export const encryptionReady = () => encryptionKey() !== null;
export const storageMode = (): "server" | "browser" => (hasServerStore() ? "server" : "browser");
/** The site requires sign-in (server storage keeps real call data behind a password). */
export const gateActive = () => storageMode() === "server";

/** Why a workspace can't be saved right now, or null when it can. */
export function storeProblem(): string | null {
  if (!encryptionReady()) return "The server has no encryption key yet: connect Upstash Redis storage to the Vercel project (or set ENCRYPTION_KEY).";
  if (storageMode() === "server" && !passwordConfigured()) return "Set an APP_PASSWORD (at least 8 characters) in Vercel first, so only you can see the call data.";
  return null;
}

function decode<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)) as T; } catch { return null; } // tampered, or the key changed
}
const valid = (w: unknown): w is LiveWorkspace =>
  !!w && typeof (w as LiveWorkspace).id === "string" && typeof (w as LiveWorkspace).apiKey === "string" && Array.isArray((w as LiveWorkspace).agentIds);

const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: MAX_AGE };

/** Every created workspace (never includes the sample). Empty for visitors who aren't signed in. */
export const listWorkspaces = cache(async (): Promise<LiveWorkspace[]> => {
  if (!encryptionReady()) return [];
  let list: LiveWorkspace[] | null;
  let legacy: LiveConn | null;
  if (storageMode() === "server") {
    if (!(await isSignedIn())) return []; // never hand real call data to an anonymous visitor
    try {
      list = decode<LiveWorkspace[]>(await storeGet(STORE_KEY));
      legacy = list ? null : decode<LiveConn>(await storeGet(LEGACY_STORE_KEY));
    } catch { return []; }
  } else {
    const jar = await cookies();
    list = decode<LiveWorkspace[]>(jar.get(LIST_COOKIE)?.value);
    legacy = list ? null : decode<LiveConn>(jar.get(LEGACY_COOKIE)?.value);
  }
  if (!list && legacy?.apiKey) list = [{ ...legacy, id: "ws_first" }]; // connection saved before workspaces existed
  return (Array.isArray(list) ? list : []).filter(valid);
});

async function saveAll(list: LiveWorkspace[]) {
  const value = encrypt(JSON.stringify(list));
  if (storageMode() === "server") {
    await storeSet(STORE_KEY, value);
    await storeDel(LEGACY_STORE_KEY).catch(() => {});
    return;
  }
  const jar = await cookies();
  jar.set(LIST_COOKIE, value, cookieOpts);
  jar.delete(LEGACY_COOKIE);
}

/** The workspace this browser is looking at: a created workspace, or null for the sample. */
export const getActiveWorkspace = cache(async (): Promise<LiveWorkspace | null> => {
  const id = (await cookies()).get(ACTIVE_COOKIE)?.value;
  if (!id || id === SAMPLE_ID) return null;
  return (await listWorkspaces()).find((w) => w.id === id) ?? null;
});

/** The active workspace's Retell connection (null on the sample workspace). */
export const getLiveConn = async (): Promise<LiveConn | null> => getActiveWorkspace();

export async function setActiveWorkspace(id: string) {
  (await cookies()).set(ACTIVE_COOKIE, id, cookieOpts);
}

export async function createWorkspace(conn: LiveConn): Promise<LiveWorkspace> {
  const list = await listWorkspaces();
  if (list.length >= MAX_WORKSPACES) throw new Error(`You can have up to ${MAX_WORKSPACES} workspaces.`);
  const ws: LiveWorkspace = { ...conn, id: `ws_${randomBytes(6).toString("hex")}` };
  await saveAll([...list, ws]);
  await setActiveWorkspace(ws.id);
  return ws;
}

export async function updateWorkspace(id: string, patch: Partial<LiveConn>) {
  const list = await listWorkspaces();
  await saveAll(list.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

export async function deleteWorkspace(id: string) {
  const list = await listWorkspaces();
  await saveAll(list.filter((w) => w.id !== id));
  await setActiveWorkspace(SAMPLE_ID);
}
