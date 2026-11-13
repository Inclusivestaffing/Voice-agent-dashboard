"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import ReportPeriodField from "@/components/reports/ReportPeriodField";
import { DEMO_RANGE } from "@/lib/demo/range";

const field = "mt-1.5 w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-[0_1px_1px_rgb(15_23_42/0.03)] hover:border-zinc-300 focus:border-zinc-400 focus-visible:outline-none focus:ring-4 focus:ring-zinc-900/5";

/** Demo: periods count back from the last day of the sample calls (Sep 30, 2026). */
export default function DemoReportForm() {
  const router = useRouter();
  const [range, setRange] = useState<[string, string]>([DEMO_RANGE.from, DEMO_RANGE.to]);
  const [version, setVersion] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const onChange = useCallback((a: string, b: string) => setRange([a, b]), []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const [from, to] = range;
    if (!from || !to || from > to) { setErr("Pick a valid start and end date."); return; }
    setErr("");
    const p = new URLSearchParams({ range: "custom", from, to });
    if (version) p.set("version", version);
    start(() => router.push(`/demo/reports/view?${p}`));
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start max-w-3xl">
        <ReportPeriodField today={DEMO_RANGE.to} defaultPreset="this_month" onChange={onChange} min="2026-01-01" max={DEMO_RANGE.to} />
        <label className="block"><span className="block text-[13px] font-medium text-zinc-700">Agent version</span>
          <select value={version} onChange={(e) => setVersion(e.target.value)} className={field}>
            <option value="">All versions</option><option value="allen:4">Allen v4</option><option value="allen:5">Allen v5</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-zinc-500">Sample calls run from Aug 27 to Sep 30, 2026, so periods count back from Sep 30.</p>
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Building report…" : "Generate report"}</Button>
    </form>
  );
}
