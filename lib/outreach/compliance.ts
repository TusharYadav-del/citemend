import "server-only";
export type ComplianceInput = { publicContact: boolean; contactSourceUrl: string | null; emailStatus: string; score: number; minimumScore: number; suppressed: boolean; reportExists: boolean; factualityPassed: boolean; unsubscribeToken: string; country: string };
export function checkOutreachCompliance(input: ComplianceInput) {
  const failures: string[] = [];
  if (!input.publicContact || !input.contactSourceUrl) failures.push("contact_not_publicly_sourced");
  if (input.emailStatus !== "verified") failures.push("contact_not_verified");
  if (input.score < input.minimumScore) failures.push("score_below_threshold");
  if (input.suppressed) failures.push("suppressed");
  if (!input.reportExists) failures.push("report_not_published");
  if (!input.factualityPassed) failures.push("factuality_check_failed");
  if (!input.unsubscribeToken) failures.push("unsubscribe_missing");
  if (input.country !== "US" && input.country !== "UK") failures.push("unsupported_country");
  return { eligible: failures.length === 0, failures };
}
