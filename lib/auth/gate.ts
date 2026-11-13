import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Password gate for the dashboard. When the Retell connection is saved on the server (so every
 * visitor would otherwise see real call data), viewers must sign in with APP_PASSWORD.
 * The session cookie is an HMAC-signed expiry; changing APP_PASSWORD signs everyone out.
 */
export const SESSION_COOKIE = "va_session";
const DAYS = 30;

export const passwordConfigured = () => (process.env.APP_PASSWORD ?? "").length >= 8;

function secret() {
  return createHash("sha256").update(`${process.env.APP_PASSWORD ?? ""}|${process.env.ENCRYPTION_KEY ?? ""}|va-session-v1`).digest();
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

export function passwordMatches(input: string): boolean {
  if (!passwordConfigured()) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(process.env.APP_PASSWORD!).digest();
  return timingSafeEqual(a, b);
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
