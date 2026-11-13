import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { encryptionKey } from "../crypto";

/**
 * Password gate for the dashboard. When the Retell connection is saved on the server (so every
 * visitor would otherwise see real call data), viewers must sign in with APP_PASSWORD.
 * The session cookie is an HMAC-signed expiry; changing APP_PASSWORD signs everyone out.
 */
export const SESSION_COOKIE = "va_session";
const DAYS = 30;

export const passwordConfigured = () => (process.env.APP_PASSWORD ?? "").length >= 8;

function secret() {
  return createHash("sha256").update(`${process.env.APP_PASSWORD ?? ""}|${encryptionKey()?.toString("base64") ?? ""}|va-session-v1`).digest();
}
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export async function isSignedIn(): Promise<boolean> {
  if (!passwordConfigured()) return false;
  const v = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const [exp, mac] = v.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The sign-in email, if one is set (APP_EMAIL). Not secret; compared case-insensitively. */
export const signInEmail = () => (process.env.APP_EMAIL ?? "").trim().toLowerCase();

const same = (x: string, y: string) => timingSafeEqual(createHash("sha256").update(x).digest(), createHash("sha256").update(y).digest());

/** Checks the password (and the email, when APP_EMAIL is set) in constant time. */
export function credentialsMatch(email: string, password: string): boolean {
  if (!passwordConfigured()) return false;
  const emailOk = same(email.trim().toLowerCase(), signInEmail());
  const passOk = same(password, process.env.APP_PASSWORD!);
  return (signInEmail() ? emailOk : true) && passOk;
}

export async function startSession() {
  const exp = String(Date.now() + DAYS * 86400_000);
  (await cookies()).set(SESSION_COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
