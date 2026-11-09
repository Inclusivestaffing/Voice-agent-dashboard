import { redirect } from "next/navigation";
import { parseFilters } from "../filters";
import { DEMO_RANGE, DEMO_TZ } from "./openWater";

/** Demo pages default to the sample window; redirect so the URL (and the range buttons) reflect it. */
export function demoFilters(sp: Record<string, string>, path: string) {
  const params = new URLSearchParams(sp);
  if (!params.get("range")) {
    params.set("range", "custom"); params.set("from", DEMO_RANGE.from); params.set("to", DEMO_RANGE.to);
    redirect(`${path}?${params}`);
  }
  return { f: parseFilters(params, DEMO_TZ), params };
}
