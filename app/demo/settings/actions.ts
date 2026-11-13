"use server";

import { revalidatePath } from "next/cache";
import { clearLiveConn, gateActive, getLiveConn, saveLiveConn, storageMode, storeProblem } from "@/lib/live/conn";
import { isSignedIn } from "@/lib/auth/gate";
import { liveAgents } from "@/lib/live/retell";
import { isValidTimezone } from "@/lib/security";

export type ConnectState = { ok?: boolean; error?: string; message?: string } | null;

const RETELL_KEY = /^[A-Za-z0-9_\-]{16,200}$/;
const AGENT_ID = /^[A-Za-z0-9_-]{1,80}$/;
const str = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

function parseAgentIds(raw: string) {
  const ids = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return { ids: [...new Set(ids)].slice(0, 50), bad: ids.filter((i) => !AGENT_ID.test(i)) };
}

/** With server storage, only a signed-in admin may change the connection. */
async function allowed() {
  return !gateActive() || (await isSignedIn());
}

/** Check the key against Retell, then save it encrypted (server storage, or this browser). */
export async function connectRetell(_: ConnectState, form: FormData): Promise<ConnectState> {
  const problem = storeProblem();
  if (problem) return { error: problem };
  if (!(await allowed())) return { error: "Sign in first." };
  const apiKey = str(form, "api_key", 200);
  if (!RETELL_KEY.test(apiKey)) return { error: "That doesn't look like a Retell API key. Copy it from Retell → Settings → API Keys." };
  const { ids, bad } = parseAgentIds(str(form, "agent_ids", 4000));
  if (bad.length) return { error: `These agent IDs aren't valid: ${bad.slice(0, 3).join(", ")}` };
  const timezone = str(form, "timezone", 64) || "UTC";
  if (!isValidTimezone(timezone)) return { error: "Unknown time zone." };

  let agents: Awaited<ReturnType<typeof liveAgents>>;
  try {
    agents = await liveAgents({ apiKey });
  } catch {
    return { error: "Retell rejected that API key. Check it in Retell → Settings → API Keys and try again." };
  }
  const known = new Set(agents.map((a) => a.agent_id));
  const missing = ids.filter((i) => !known.has(i));
  if (missing.length) return { error: `Retell doesn't have ${missing.length === 1 ? "this agent" : "these agents"} on that account: ${missing.slice(0, 3).join(", ")}` };

  const chosen = ids.length ? agents.filter((a) => ids.includes(a.agent_id)) : agents;
  const name = str(form, "name", 80) || (chosen.length === 1 ? chosen[0].agent_name : "My Retell account");
  try {
    await saveLiveConn({ apiKey, agentIds: ids, name, timezone, connectedAt: new Date().toISOString() });
  } catch {
    return { error: "Couldn't save the connection to storage. Check the Upstash Redis connection in Vercel." };
  }
  revalidatePath("/demo", "layout");
  return { ok: true, message: `Connected${storageMode() === "server" ? " and saved on the server" : ""}. Showing live calls from ${ids.length ? `${chosen.length} agent${chosen.length === 1 ? "" : "s"}` : `all ${agents.length} agents`}.` };
}

/** Change which agents are shown, the workspace name or the time zone. */
export async function updateRetell(_: ConnectState, form: FormData): Promise<ConnectState> {
  if (!(await allowed())) return { error: "Sign in first." };
  const conn = await getLiveConn();
  if (!conn) return { error: "Retell isn't connected any more. Connect it again." };
  const ids = form.getAll("agent").map(String).filter((i) => AGENT_ID.test(i)).slice(0, 50);
  const agents = await liveAgents(conn).catch(() => []);
  const known = new Set(agents.map((a) => a.agent_id));
  const agentIds = ids.filter((i) => known.has(i));
  const timezone = str(form, "timezone", 64) || conn.timezone;
  if (!isValidTimezone(timezone)) return { error: "Unknown time zone." };
  await saveLiveConn({ ...conn, agentIds: agentIds.length === agents.length ? [] : agentIds, name: str(form, "name", 80) || conn.name, timezone });
  revalidatePath("/demo", "layout");
  return { ok: true, message: "Saved." };
}

export async function disconnectRetell() {
  if (!(await allowed())) throw new Error("Sign in first.");
  await clearLiveConn();
  revalidatePath("/demo", "layout");
}
