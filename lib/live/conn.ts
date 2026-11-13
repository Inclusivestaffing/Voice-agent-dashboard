import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { decrypt, encrypt } from "../crypto";
import { hasServerStore, storeDel, storeGet, storeSet } from "./store";
import { isSignedIn, passwordConfigured } from "../auth/gate";

/**
 * The Retell account connected from Settings (API key + chosen agents), always AES-256-GCM encrypted.
 *
 * Where it lives:
 *  - "server": in the project's Vercel storage (Upstash Redis). One connection for the whole site,
 *    shared by every device. Requires APP_PASSWORD, and only signed-in viewers can use it.
 *  - "browser": in an httpOnly cookie for this browser only (local development, or before storage
 *    is set up on Vercel).
 */
export interface LiveConn {
  apiKey: string;
  agentIds: string[];   // empty = every agent in the Retell account
  name: string;         // business / workspace name shown in the app
  timezone: string;
  connectedAt: string;
}

export const LIVE_COOKIE = "retell_conn";
const STORE_KEY = "va:retell-connection:v1";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const encryptionReady = () => {
  try { return Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64").length === 32; } catch { return false; }
};
export const storageMode = (): "server" | "browser" => (hasServerStore() ? "server" : "browser");
/** The site requires sign-in (server storage keeps real call data behind a password). */
export const gateActive = () => storageMode() === "server";

/** Why a connection can't be saved right now, or null when it can. */
export function storeProblem(): string | null {
  if (!encryptionReady()) return "The server is missing its ENCRYPTION_KEY setting, so it can't store the key safely.";
  if (storageMode() === "server" && !passwordConfigured()) return "Set an APP_PASSWORD (at least 8 characters) in Vercel first, so only you can see the call data.";
  return null;
}
/** Kept for older imports. */
export const canStoreConnection = () => storeProblem() === null;

function parse(raw: string | null | undefined): LiveConn | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decrypt(raw)) as LiveConn;
    return typeof v.apiKey === "string" && Array.isArray(v.agentIds) ? v : null;
  } catch {
    return null; // tampered, or the server key changed
  }
}

export const getLiveConn = cache(async (): Promise<LiveConn | null> => {
  if (!encryptionReady()) return null;
  if (storageMode() === "server") {
    if (!(await isSignedIn())) return null; // never hand real call data to an anonymous visitor
    try { return parse(await storeGet(STORE_KEY)); } catch { return null; }
  }
  return parse((await cookies()).get(LIVE_COOKIE)?.value);
});

export async function saveLiveConn(conn: LiveConn) {
  const value = encrypt(JSON.stringify(conn));
  if (storageMode() === "server") { await storeSet(STORE_KEY, value); return; }
  (await cookies()).set(LIVE_COOKIE, value, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}

export async function clearLiveConn() {
  if (storageMode() === "server") { await storeDel(STORE_KEY); return; }
  (await cookies()).delete(LIVE_COOKIE);
}
