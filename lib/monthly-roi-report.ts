export type MonthlyRecoveryFinding = {
  finding_type: string;
  approval_status: string;
  guardrail_classification: string;
};

export type MonthlyRoiMetrics = {
  highIntentErrors: number;
  recoveredVisits: number | null;
  preventedRecommendations: number;
  estimatedHoursSaved: number;
};

export type ReportMonth = {
  value: string;
  label: string;
  start: string;
  end: string;
};

const MONTH_VALUE = /^([0-9]{4})-(0[1-9]|1[0-2])$/;

export function parseReportMonth(value: unknown, now = new Date()): ReportMonth | null {
  if (typeof value !== "string") return null;
  const match = MONTH_VALUE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > now.getUTCFullYear() || (year === now.getUTCFullYear() && month > now.getUTCMonth() + 1)) return null;

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));
  const label = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(startDate);
  return { value, label, start: startDate.toISOString(), end: endDate.toISOString() };
}

export function currentReportMonth(now = new Date()): ReportMonth {
  const value = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = parseReportMonth(value, now);
  if (!month) throw new Error("Could not determine the current report month.");
  return month;
}

export function calculateMonthlyRoiMetrics(
  findings: MonthlyRecoveryFinding[],
  recoveredVisits: number | null,
): MonthlyRoiMetrics {
  const highIntentErrors = findings.filter(row => row.finding_type === "dead_url" && ["pending_human_review", "approved"].includes(row.approval_status)).length;
  const preventedRecommendations = findings.filter(row => row.guardrail_classification === "leave_as_404_or_410" || row.approval_status === "rejected_bad_recommendation").length;
  const handled = findings.filter(row => row.approval_status !== "pending_human_review").length;
  return {
    highIntentErrors,
    recoveredVisits,
    preventedRecommendations,
    estimatedHoursSaved: Math.round(handled * 0.25 * 100) / 100,
  };
}
