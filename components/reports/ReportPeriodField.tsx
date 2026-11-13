"use client";

import { useEffect, useState } from "react";
import DateRangePicker, { REPORT_PRESETS, type DRValue } from "@/components/filters/DateRangePicker";

/**
 * Report period: presets (This month, Last 30/90 days, Last 3/6 months) or any custom range picked
 * on the calendar. Submits `from` and `to` (YYYY-MM-DD) as hidden form fields.
 */
export default function ReportPeriodField({ today, defaultPreset = "last_30", onChange, min, max }: {
  today: string; defaultPreset?: string; onChange?: (from: string, to: string) => void; min?: string; max?: string;
}) {
  const [value, setValue] = useState<DRValue>({ preset: defaultPreset, from: null, to: null });
  const dates = value.preset ? REPORT_PRESETS.find((p) => p.id === value.preset)?.dates?.(today) ?? null : value.from && value.to ? [value.from, value.to] as const : null;
  const from = dates?.[0] ?? "", to = dates?.[1] ?? "";
  useEffect(() => { if (from && to) onChange?.(from, to); }, [from, to, onChange]);
  return (
    <div>
      <span className="block text-[13px] font-medium text-zinc-700">Report period</span>
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <DateRangePicker variant="field" presets={REPORT_PRESETS} today={today} value={{ ...value, from: value.preset ? from : value.from, to: value.preset ? to : value.to }}
        onApply={setValue} min={min} max={max} />
    </div>
  );
}
