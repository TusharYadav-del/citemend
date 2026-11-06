import assert from "node:assert/strict";
import { test } from "node:test";
import { nextScheduledReportAt } from "../lib/scheduled-report-cadence";

test("one-time report has no next occurrence", () => {
  assert.equal(nextScheduledReportAt("2026-11-06T04:00:00.000Z", "one_time", Date.parse("2026-11-07T00:00:00.000Z")), null);
});

test("weekly and biweekly reports advance to the next future occurrence", () => {
  const now = Date.parse("2026-11-20T04:00:00.000Z");
  assert.equal(nextScheduledReportAt("2026-11-06T04:00:00.000Z", "weekly", now), "2026-11-27T04:00:00.000Z");
  assert.equal(nextScheduledReportAt("2026-11-06T04:00:00.000Z", "biweekly", now), "2026-12-04T04:00:00.000Z");
});

test("monthly recurrence clamps dates at the target month's last day", () => {
  assert.equal(nextScheduledReportAt("2026-01-31T04:00:00.000Z", "monthly", Date.parse("2026-01-31T04:00:00.000Z")), "2026-02-28T04:00:00.000Z");
  assert.equal(nextScheduledReportAt("2026-01-31T04:00:00.000Z", "monthly", Date.parse("2026-03-01T04:00:00.000Z")), "2026-03-31T04:00:00.000Z");
});

test("unsupported recurrence values fail closed", () => {
  assert.throws(() => nextScheduledReportAt("2026-11-06T04:00:00.000Z", "daily"), /Unsupported/);
});
