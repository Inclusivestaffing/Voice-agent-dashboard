"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cx } from "../ui";

const BUCKETS = [["hour", "Hour"], ["day", "Day"], ["week", "Week"], ["month", "Month"]] as const;

/** Retell-style dashboard controls: Breakdown, time bucket and previous-period comparison, kept in the URL. */
export default function AnalyticsControls({ bucket, compare, breakdown, breakdowns }: {
  bucket: string; compare: boolean; breakdown: string; breakdowns: { id: string; label: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp.toString());
    if (v === null || v === "") n.delete(k); else n.set(k, v);
    start(() => router.push(`${path}?${n}`, { scroll: false }));
  };
  return (
    <div className="flex items-center gap-3 flex-wrap min-w-0 max-w-full" aria-busy={pending}>
      {pending && <div className="progress-bar" role="progressbar" aria-label="Updating charts" />}
      <label className="flex items-center gap-1.5 text-xs text-zinc-600 min-w-0 max-w-full">
        <span className="font-semibold shrink-0">Breakdown</span>
        <select
          value={breakdown}
          onChange={(e) => set("breakdown", e.target.value)}
          aria-label="Breakdown every chart by"
          className="min-w-0 max-w-full sm:max-w-[240px] border border-zinc-200 rounded-lg px-2.5 py-1 text-xs bg-white text-zinc-800 shadow-2xs focus:outline-none focus:ring-1 focus:ring-zinc-900 transition cursor-pointer"
        >
          <option value="">None</option>
          {breakdowns.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>

      {/* Time bucket segmented pill track */}
      <div className="bg-zinc-100 p-0.5 rounded-lg inline-flex items-center gap-0.5" role="group" aria-label="Time bucket">
        {BUCKETS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => set("bucket", id)}
            aria-pressed={bucket === id}
            className={cx(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
              bucket === id
                ? "bg-white text-zinc-900 font-semibold shadow-xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <label className={cx("flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer font-medium select-none", breakdown && "opacity-50")} title={breakdown ? "Comparison is unavailable while a breakdown is applied" : undefined}>
        <input
          type="checkbox"
          checked={compare}
          disabled={!!breakdown}
          onChange={(e) => set("compare", e.target.checked ? "1" : null)}
          className="rounded-md border-zinc-300 text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
        />
        Previous period comparison
      </label>
    </div>
  );
}
