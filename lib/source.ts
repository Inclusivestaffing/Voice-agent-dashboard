import "server-only";
import { cache } from "react";
import { demoCalls, demoFilterOptions, DEMO_BH, DEMO_TZ, DEMO_WORKSPACE, type DemoCall } from "./demo/openWater";
import { demoRawCall } from "./demo/callRaw";
import { getLiveConn, type LiveConn } from "./live/conn";
import { liveAgents, liveCall, liveCalls, toRow } from "./live/retell";
import type { RetellCall } from "./types";
import type { FilterOptions } from "@/components/filters/FilterBar";

/**
 * Where the /demo app gets its calls: the Open Water Marine sample, or — once a Retell account is
 * connected in Settings — the account's real calls, fetched live from Retell's API.
 */
export interface Source {
  live: boolean;
  conn: LiveConn | null;
  name: string;
  agentName: string | null;
  timezone: string;
  businessHours: Record<string, [number, number]>;
  /** All calls that started in the window (other filters are applied by the caller). */
  calls: (fromIso: string, toIso: string) => Promise<DemoCall[]>;
  filterOptions: (calls: DemoCall[]) => Promise<FilterOptions>;
  /** One call with its full Retell object (transcript, recording, latency). */
  call: (id: string) => Promise<{ row: DemoCall; raw: RetellCall } | null>;
}

const WEEKDAYS: Record<string, [number, number]> = { mon: [9, 17], tue: [9, 17], wed: [9, 17], thu: [9, 17], fri: [9, 17] };

export const getSource = cache(async (): Promise<Source> => {
  const conn = await getLiveConn();
  if (!conn) {
    return {
      live: false, conn: null, name: DEMO_WORKSPACE.name, agentName: "Allen", timezone: DEMO_TZ, businessHours: DEMO_BH,
      calls: async () => demoCalls(),
      filterOptions: async () => demoFilterOptions(),
      call: async (id) => {
        const row = demoCalls().find((c) => c.call_id === id);
        return row ? { row, raw: demoRawCall(row) } : null;
      },
    };
  }
  const agents = await liveAgents(conn).catch(() => []);
  const chosen = conn.agentIds.length ? agents.filter((a) => conn.agentIds.includes(a.agent_id)) : agents;
  const names = new Map(agents.map((a) => [a.agent_id, a.agent_name]));
  return {
    live: true, conn, name: conn.name, timezone: conn.timezone, businessHours: WEEKDAYS,
    agentName: chosen.length === 1 ? chosen[0].agent_name : null,
    calls: (from, to) => liveCalls(conn, from, to),
    filterOptions: async (calls) => liveOptions(calls, chosen.map((a) => ({ id: a.agent_id, name: a.agent_name }))),
    call: async (id) => {
      const raw = await liveCall(conn, id);
      return raw ? { row: toRow(raw, names, true), raw } : null;
    },
  };
});

/** Filter menus built from the calls actually in the window. */
function liveOptions(calls: DemoCall[], agents: { id: string; name: string }[]): FilterOptions {
  const versions = new Map<string, string>();
  const disc = new Set<string>();
  const fields = (pick: (c: DemoCall) => Record<string, unknown> | null | undefined) => {
    const m = new Map<string, Set<string>>();
    for (const c of calls) for (const [k, v] of Object.entries(pick(c) ?? {})) {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(k) || v == null || typeof v === "object") continue;
      if (!m.has(k)) m.set(k, new Set());
      if (m.get(k)!.size < 25) m.get(k)!.add(String(v));
    }
    return [...m.entries()].map(([key, vals]) => ({ key, values: [...vals].sort() })).sort((a, b) => a.key.localeCompare(b.key));
  };
  for (const c of calls) {
    if (c.agent_id && c.agent_version != null) versions.set(`${c.agent_id}:${c.agent_version}`, `${c.agent_name ?? c.agent_id} v${c.agent_version}`);
    if (c.disconnection_reason) disc.add(c.disconnection_reason);
  }
  return {
    agents,
    versions: [...versions.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    disconnections: [...disc].sort(),
    customFields: fields((c) => c.custom_analysis),
    metadataFields: fields((c) => c.metadata),
    dynamicFields: fields((c) => c.dynamic_variables),
  };
}
