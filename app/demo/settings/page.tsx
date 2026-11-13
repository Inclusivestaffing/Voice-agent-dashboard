import { DEMO_TZ } from "@/lib/demo/openWater";
import { getSource } from "@/lib/source";
import { gateActive, storageMode, storeProblem } from "@/lib/live/conn";
import { signOut } from "@/app/unlock/actions";
import { liveAgents } from "@/lib/live/retell";
import RetellIntegration, { type ConnectedInfo } from "@/components/settings/RetellIntegration";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DemoSettingsPage() {
  const src = await getSource();
  let connected: ConnectedInfo | null = null;
  if (src.conn) {
    let agents: ConnectedInfo["agents"] = [];
    let agentsError: string | null = null;
    try { agents = await liveAgents(src.conn); } catch { agentsError = "Couldn't load agents from Retell. The API key may have been revoked."; }
    connected = { last4: src.conn.apiKey.slice(-4), name: src.conn.name, timezone: src.conn.timezone, connectedAt: src.conn.connectedAt, agentIds: src.conn.agentIds, agents, agentsError };
  }
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] text-zinc-900">
            Settings
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">
            Workspaces, Retell connection, agents and branding.
          </p>
        </div>
        {gateActive() && (
          <form action={signOut}>
            <button type="submit" className="h-9 rounded-lg border border-zinc-200 px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">Sign out</button>
          </form>
        )}
      </div>

      <Card title={connected ? "Retell integration" : "Create a workspace"} sub={connected ? "Live calls, transcripts and recordings come straight from this workspace's Retell account." : "You're on the sample workspace (Open Water Marine). Create a workspace with a Retell API key to see real calls, transcripts and recordings. The sample stays available in the workspace menu."} className="mt-6">
        <RetellIntegration connected={connected} problem={storeProblem()} storage={storageMode()} />
      </Card>

      <div className="grid xl:grid-cols-2 gap-6 mt-6">
        {/* 2. Voice Agent & Workspace Details */}
        {!src.live && (
        <Card
          title="Voice Agent & Workspace Profile"
          sub="Primary Retell agent configuration and operating schedule"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 pb-3 border-b border-zinc-100">
              <div>
                <span className="text-zinc-400 block mb-0.5">Workspace</span>
                <span className="font-semibold text-zinc-800 text-sm">Open Water Marine</span>
              </div>
              <div>
                <span className="text-zinc-400 block mb-0.5">Primary Agent</span>
                <span className="font-semibold text-zinc-800 text-sm">Allen (AI Receptionist)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-3 border-b border-zinc-100">
              <div>
                <span className="text-zinc-400 block mb-0.5">Timezone</span>
                <span className="font-medium text-zinc-700">{DEMO_TZ}</span>
              </div>
              <div>
                <span className="text-zinc-400 block mb-0.5">Operating Hours</span>
                <span className="font-medium text-zinc-700">Mon–Fri 8:30 AM – 5:30 PM</span>
              </div>
            </div>

            <div>
              <span className="text-zinc-400 block mb-1">Supported Capabilities</span>
              <div className="flex flex-wrap gap-1.5">
                {["Inbound Call Reception", "Service Scheduling", "Emergency Escalation", "Quote Qualification", "Live Transfers"].map((cap) => (
                  <span key={cap} className="px-2.5 py-1 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-700 font-medium text-[11px]">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
        )}


        {/* 4. Branding & Design Configuration */}
        <Card
          title="Branding & Design System"
          sub="Visual theme separation between internal system and client reports"
        >
          <div className="space-y-3.5 text-xs">
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-800">Internal Dashboard UI</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-200 text-zinc-800">
                  Minimal Slate
                </span>
              </div>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                Clean, default Retell AI styling with neutral borders, white surfaces, and easy-to-read typography.
              </p>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900">Client Reports & Exports</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/30 text-amber-950 border border-amber-300">
                  Inclusive Branded
                </span>
              </div>
              <p className="text-amber-800/80 text-[11px] leading-relaxed">
                Yellow brand highlights and client report themes are strictly scoped to printable client deliverables and PDF exports.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

