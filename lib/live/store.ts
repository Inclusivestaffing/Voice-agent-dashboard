import "server-only";

/**
 * Tiny server-side key/value store backed by Upstash Redis — what Vercel provides under
 * Storage → "Upstash for Redis" (it adds KV_REST_API_URL and KV_REST_API_TOKEN to the project).
 * Talks to the REST API directly, so there's no extra dependency. Values are encrypted by the caller.
 */
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const hasServerStore = () => !!(url() && token());

async function command<T>(args: (string | number)[]): Promise<T | null> {
  const res = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Storage error (${res.status})`);
  const body = (await res.json()) as { result?: T; error?: string };
  if (body.error) throw new Error(`Storage error: ${body.error}`);
  return body.result ?? null;
}

export const storeGet = (key: string) => command<string>(["GET", key]);
export const storeSet = (key: string, value: string) => command<string>(["SET", key, value]);
export const storeDel = (key: string) => command<number>(["DEL", key]);
export const storeMGet = (keys: string[]) => (keys.length ? command<(string | null)[]>(["MGET", ...keys]) : Promise.resolve([] as (string | null)[]));
/** SET only if the key doesn't exist, expiring after `ttlS` seconds. True when this call set it (a lock). */
export const storeSetNx = async (key: string, value: string, ttlS: number) => (await command<string>(["SET", key, value, "NX", "EX", ttlS])) === "OK";
/** SET with an expiry in seconds. */
export const storeSetEx = (key: string, value: string, ttlS: number) => command<string>(["SET", key, value, "EX", ttlS]);
/** Lists (newest first with LPUSH). */
export const storeLPush = (key: string, value: string) => command<number>(["LPUSH", key, value]);
export const storeLRange = async (key: string, start: number, stop: number) => (await command<string[]>(["LRANGE", key, start, stop])) ?? [];
export const storeLTrim = (key: string, start: number, stop: number) => command<string>(["LTRIM", key, start, stop]);
export const storeLRem = (key: string, value: string) => command<number>(["LREM", key, 0, value]);
/** Increment a counter that expires after `ttlS` seconds; returns the new value. */
export async function storeIncr(key: string, ttlS: number): Promise<number> {
  const n = (await command<number>(["INCR", key])) ?? 0;
  if (n === 1) await command<number>(["EXPIRE", key, ttlS]);
  return n;
}
