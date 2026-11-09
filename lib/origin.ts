import "server-only";
import { headers } from "next/headers";

/**
 * Public origin of the app. In production this MUST come from NEXT_PUBLIC_APP_URL — never from the
 * request's Host header, which an attacker controls (host-header poisoning of share links, invites
 * and the PDF renderer's target URL).
 */
export async function appOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_APP_URL must be set in production");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : "http://localhost:3000";
}
