import { redirect } from "next/navigation";
import { parseFilters, DEFAULT_RANGE } from "../filters";
import { DEMO_RANGE, DEMO_TZ } from "./openWater";

/**
 * Put a date range in the URL when there isn't one, so the page and the date picker agree.
 * Sample data defaults to its own window; a live Retell account defaults to the last 4 weeks.
 */
export function demoFilters(sp: Record<string, string>, path: string, opts: { live?: boolean; timezone?: string } = {}) {
  const params = new URLSearchParams(sp);
  if (!params.get("range")) {
    if (opts.live) params.set("range", DEFAULT_RANGE);
    else { params.set("range", "custom"); params.set("from", DEMO_RANGE.from); params.set("to", DEMO_RANGE.to); }
    redirect(`${path}?${params}`);
  }
  return { f: parseFilters(params, opts.timezone ?? DEMO_TZ), params };
}
