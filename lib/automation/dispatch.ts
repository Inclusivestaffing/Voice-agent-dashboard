import "server-only";
import type { LiveWorkspace } from "../live/conn";
import { getAutomationSettings } from "./settings";
import { lastScheduledAt, runDigest } from "./digest";
import { isDue } from "./schedule";

/** The site's own public address, for the cron to start each workspace's run as its own request. */
export function selfOrigin(): string | null {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : null;
}

/**
 * Start every scheduled analysis that's due. Each run gets its own server request (up to 5 minutes
 * each), so one slow workspace can't stop the others. Without a known site address, runs happen
 * here one after another while time allows.
 */
export async function dispatchDue(workspaces: LiveWorkspace[], deadline: number) {
  const out: Record<string, string> = {};
  const origin = selfOrigin();
  for (const ws of workspaces) {
    try {
      const s = await getAutomationSettings(ws.id);
      if (!isDue(s.schedule, await lastScheduledAt(ws.id), new Date(), ws.timezone)) continue;
      if (origin && process.env.CRON_SECRET) {
        const res = await fetch(`${origin}/api/automation/run`, {
          method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ws: ws.id }),
        });
        out[ws.id] = res.ok ? "started" : `start failed (${res.status})`;
        if (res.ok) continue;
      }
      if (Date.now() > deadline) { out[ws.id] = "no time left; runs on the next check"; continue; }
      const run = await runDigest(ws, { trigger: "schedule" });
      out[ws.id] = run ? run.status : "already running";
    } catch (e) {
      out[ws.id] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return out;
}
