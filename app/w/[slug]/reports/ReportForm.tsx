"use client";

import { useActionState } from "react";
import { generateReport, type ReportState } from "./actions";
import { Button } from "@/components/ui";
import ReportPeriodField from "@/components/reports/ReportPeriodField";

const field = "mt-1.5 w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-[0_1px_1px_rgb(15_23_42/0.03)] hover:border-zinc-300 focus:border-zinc-400 focus-visible:outline-none focus:ring-4 focus:ring-zinc-900/5";

export default function ReportForm({ slug, agents, today }: { slug: string; agents: { id: string; name: string }[]; today: string }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(generateReport, null);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <ReportPeriodField today={today} />
        <label className="block"><span className="block text-[13px] font-medium text-zinc-700">Agent</span>
          <select name="agent" className={field}><option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
        <label className="block"><span className="block text-[13px] font-medium text-zinc-700">Title <span className="font-normal text-zinc-400">(optional)</span></span>
          <input name="title" placeholder="e.g. October performance report" className={field} />
        </label>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-zinc-600 rounded-lg bg-zinc-50 border border-zinc-200/70 px-3.5 py-3">
        <input type="checkbox" name="narrative" value="on" defaultChecked className="mt-0.5 h-4 w-4 accent-zinc-900" />
        <span><span className="font-medium text-zinc-900">Have Claude Opus 5.5 write the summary and recommendations</span> (about a minute). Untick for an instant rule-based summary.</span>
      </label>
      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Building report… this can take a minute" : "Generate report"}</Button>
    </form>
  );
}
