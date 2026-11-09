// Small, dependency-free security helpers shared by routes and server actions.
import { timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Only allow same-site relative redirects ("/path"), never "//host", "/\\host" or absolute URLs. */
export function safeNext(next: string | null | undefined, fallback = "/workspaces"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n\t]/.test(next)) return fallback;
  return next.slice(0, 500);
}

/** Constant-time string comparison (for shared secrets such as CRON_SECRET). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") ||
    v6.startsWith("::ffff:") && isPrivateIp(v6.slice(7));
}

/**
 * SSRF guard for outbound webhooks configured by users: https only, no credentials, standard port,
 * and every resolved address must be public (blocks localhost, link-local/metadata, private ranges).
 */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "https:") throw new Error("Webhook URL must use https://");
  if (u.username || u.password) throw new Error("Webhook URL must not contain credentials");
  if (u.port && u.port !== "443") throw new Error("Webhook URL must use the default https port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("Webhook URL must be a public address");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Webhook URL must resolve to a public address");
  return u;
}

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz.length <= 64; } catch { return false; }
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/;
