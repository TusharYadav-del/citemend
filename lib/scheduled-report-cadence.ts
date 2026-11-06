export type ScheduledReportRecurrence = "one_time" | "weekly" | "biweekly" | "monthly";

/** Compute the next future occurrence, skipping missed intervals instead of sending a backlog. */
export function nextScheduledReportAt(scheduleAt: string, recurrence: string, now = Date.now()): string | null {
  if (recurrence === "one_time") return null;
  if (recurrence !== "weekly" && recurrence !== "biweekly" && recurrence !== "monthly") throw new Error("Unsupported report recurrence.");
  const first = new Date(scheduleAt);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(now)) throw new Error("Invalid report schedule time.");
  let next = first;
  let monthlyIntervals = 0;
  for (let count = 0; next.getTime() <= now && count < 1_200; count++) {
    if (recurrence === "weekly" || recurrence === "biweekly") {
      next = new Date(next.getTime() + (recurrence === "weekly" ? 7 : 14) * 86_400_000);
    } else {
      monthlyIntervals++;
      const monthIndex = first.getUTCMonth() + monthlyIntervals;
      const year = first.getUTCFullYear() + Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      next = new Date(Date.UTC(year, month, Math.min(first.getUTCDate(), lastDay), first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds(), first.getUTCMilliseconds()));
    }
  }
  if (next.getTime() <= now) throw new Error("Could not advance the report schedule to a future occurrence.");
  return next.toISOString();
}
