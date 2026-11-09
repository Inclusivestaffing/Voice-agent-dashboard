import "server-only";
import Retell from "retell-sdk";
import { supabaseAdmin } from "../db/supabase";
import { decrypt } from "../crypto";

export async function getRetellKey(workspaceId: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("retell_connections")
    .select("api_key_encrypted")
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !data) throw new Error("This workspace has no Retell API key connected yet.");
  return decrypt(data.api_key_encrypted);
}

export function retellClient(apiKey: string) {
  return new Retell({ apiKey, maxRetries: 3, timeout: 60_000 });
}

export async function retellForWorkspace(workspaceId: string) {
  return retellClient(await getRetellKey(workspaceId));
}

/** Cheap call used to validate a key when it is first connected. */
export async function validateRetellKey(apiKey: string): Promise<{ ok: true; agents: number } | { ok: false; error: string }> {
  try {
    const client = retellClient(apiKey);
    const res = await client.agent.list({ limit: 1000 });
    return { ok: true, agents: res.items.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
