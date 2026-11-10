import { Suspense } from "react";
import { DEMO_TZ, DEMO_WORKSPACE } from "@/lib/demo/openWater";
import RoleControlsCard from "@/components/settings/RoleControlsCard";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DemoSettingsPage() {
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {DEMO_WORKSPACE.name} · Inclusive Staffing
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Settings & Access Control
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage portal access permissions, Retell integration parameters, and account controls.
          </p>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6 mt-6">
        {/* 1. Account & Role Controls (Moved from front view to inside Settings!) */}
        <RoleControlsCard email="admin@inclusivestaffing.com" name="Inclusive Staffing" />

        {/* 2. Voice Agent & Workspace Details */}
        <Card
          title="Voice Agent & Workspace Profile"
          sub="Primary Retell agent configuration and operating schedule"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-400 block mb-0.5">Workspace</span>
                <span className="font-semibold text-slate-800 text-sm">Open Water Marine</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Primary Agent</span>
                <span className="font-semibold text-slate-800 text-sm">Allen (AI Receptionist)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-400 block mb-0.5">Timezone</span>
                <span className="font-medium text-slate-700">{DEMO_TZ}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Operating Hours</span>
                <span className="font-medium text-slate-700">Mon–Fri 8:30 AM – 5:30 PM</span>
              </div>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Supported Capabilities</span>
              <div className="flex flex-wrap gap-1.5">
                {["Inbound Call Reception", "Service Scheduling", "Emergency Escalation", "Quote Qualification", "Live Transfers"].map((cap) => (
                  <span key={cap} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-medium text-[11px]">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* 3. Retell AI Integration */}
        <Card
          title="Retell AI Connection"
          sub="Voice agent telemetry, real-time webhooks, and call sync"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-emerald-900">Retell API Connected</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-800 bg-white/80 px-2 py-0.5 rounded-md border border-emerald-200">
                retell_live_••••••48
              </span>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Real-Time Webhook URL
              </label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5 font-mono text-[11px] text-slate-700 break-all select-all">
                https://analytics.inclusivestaffing.com/api/webhooks/retell/open-water
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Calls are ingested and diagnosed within seconds of disconnection.
              </p>
            </div>
          </div>
        </Card>

        {/* 4. Branding & Design Configuration */}
        <Card
          title="Branding & Design System"
          sub="Visual theme separation between internal system and client reports"
        >
          <div className="space-y-3.5 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Internal Dashboard UI</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                  Minimal Slate
                </span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Clean, default Retell AI styling with neutral borders, white surfaces, and easy-to-read typography.
              </p>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900">Client Reports & Exports</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/30 text-amber-950 border border-amber-300">
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

