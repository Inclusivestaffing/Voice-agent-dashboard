import { WEEKDAYS, type AutomationSettings } from "./types";

/** The daily job runs at this UTC hour (must match "crons" in vercel.json). */
export const CRON_UTC_HOUR = 0;

const weekdayIn = (d: Date, tz: string) =>
  WEEKDAYS.indexOf(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(d) as (typeof WEEKDAYS)[number]);

/**
 * Is a scheduled analysis due now? The first run comes as soon as the schedule is switched on. Then
 * daily: once every ~24 h; weekly: on the chosen weekday (in the workspace's time zone), or straight
 * away if a week was missed.
 */
export function isDue(s: AutomationSettings["schedule"], lastIso: string | null, now: Date, tz: string): boolean {
  if (!s.enabled) return false;
  const last = lastIso ? Date.parse(lastIso) : NaN;
  const since = Number.isFinite(last) ? now.getTime() - last : Infinity;
  if (!Number.isFinite(last)) return true; // just switched on: the first report comes straight away
  if (s.frequency === "daily") return since > 20 * 3600_000;
  if (weekdayIn(now, tz) === s.weekday) return since > 6 * 86400_000;
  return since > 8 * 86400_000;
}

/** "Every Monday around 6:00 PM" in the workspace's time zone. */
export function scheduleLabel(s: AutomationSettings["schedule"], tz: string, now = new Date()): string {
  const run = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, CRON_UTC_HOUR));
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(run);
  return s.frequency === "daily" ? `Every day around ${time}` : `Every ${WEEKDAYS[s.weekday]} around ${time}`;
}
