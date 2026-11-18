import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createServerDatabase } from "../supabase-server";
import { normalizeDashboardDomain } from "../audit-dashboard";
import { normalizeRecoveryUrl } from "./normalize";
import { verifyDeployedRedirect, type RedirectVerification } from "./verify";

export type RedirectQaStatus = "healthy" | "source_not_redirecting" | "redirect_chain_or_loop" | "destination_not_200" | "check_unavailable";
type Finding = { id: string; domain: string; normalized_path: string; suggested_target_url: string | null; sourceTable: "recovery_findings" | "redirect_rules" };
type QaDatabase = ReturnType<typeof createServerDatabase>;
type Dependencies = {
  secret: () => string | undefined;
  database: () => QaDatabase;
  now: () => Date;
  verify: typeof verifyDeployedRedirect;
  batchSize: number;
};

export function classifyRedirectQa(result: RedirectVerification): RedirectQaStatus {
  if (result.ok) return "healthy";
  if (result.oldUrlStatus === null) return "check_unavailable";
  if (result.oldUrlStatus !== 301 && result.oldUrlStatus !== 302) return "source_not_redirecting";
  if (result.reason.includes("directly") || result.reason.includes("loop") || result.reason.includes("chain")) return "redirect_chain_or_loop";
  if (result.destinationStatus !== null && result.destinationStatus !== 200) return "destination_not_200";
  return "check_unavailable";
}

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function migrationNotApplied(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return ["42703", "PGRST202", "PGRST204"].includes(code);
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await work(items[index]); }
  }));
  return output;
}

function saveQaResult(db: QaDatabase, finding: Finding, values: Record<string, unknown>) {
  if (finding.sourceTable === "recovery_findings") {
    return db.from("recovery_findings").update(values as never).eq("id", finding.id).eq("approval_status", "deployed");
  }
  return db.from("redirect_rules").update(values as never).eq("id", finding.id).eq("is_active", true).eq("synced_to_cms", true);
}

export function createRecoveryQaCronHandler(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    secret: overrides.secret ?? (() => process.env.CRON_SECRET?.trim()),
    database: overrides.database ?? createServerDatabase,
    now: overrides.now ?? (() => new Date()),
    verify: overrides.verify ?? verifyDeployedRedirect,
    batchSize: Math.max(1, Math.min(100, overrides.batchSize ?? 40)),
  };
  return async function run(request: Request) {
    const secret = deps.secret();
    if (!secret) return Response.json({ error: "Redirect QA cron is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    if (!authorized(request.headers.get("authorization"), secret)) return Response.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    try {
      const db = deps.database();
      const [findingResult, ruleResult] = await Promise.all([
        db.from("recovery_findings").select("id,domain,normalized_path,suggested_target_url")
        .eq("finding_type", "dead_url").eq("approval_status", "deployed")
        .not("suggested_target_url", "is", null)
        .order("qa_checked_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }).limit(deps.batchSize),
        db.from("redirect_rules").select("id,domain,normalized_path:source_path,suggested_target_url:target_url")
          .eq("is_active", true).eq("synced_to_cms", true).not("shopify_redirect_id", "is", null)
          .order("qa_checked_at", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true }).limit(deps.batchSize),
      ]);
      if (findingResult.error || ruleResult.error) {
        const error = findingResult.error ?? ruleResult.error;
        if (migrationNotApplied(error)) return Response.json({ skipped: true, reason: "migration_040_pending" }, { headers: { "Cache-Control": "no-store" } });
        throw error;
      }
      const findings = [
        ...((findingResult.data ?? []) as Omit<Finding, "sourceTable">[]).map(row => ({ ...row, sourceTable: "recovery_findings" as const })),
        ...((ruleResult.data ?? []) as Omit<Finding, "sourceTable">[]).map(row => ({ ...row, sourceTable: "redirect_rules" as const })),
      ];
      const checkedAt = deps.now().toISOString();
      const checked = await mapLimit(findings, 5, async finding => {
        let domain: string;
        let path: string;
        try {
          domain = normalizeDashboardDomain(finding.domain);
          path = normalizeRecoveryUrl(`https://${domain}${finding.normalized_path}`).normalized_path;
          if (domain !== finding.domain || path !== finding.normalized_path || !finding.suggested_target_url) throw new Error("Invalid stored redirect source.");
        } catch {
          const saved = await saveQaResult(db, finding, { qa_checked_at: checkedAt, qa_status: "check_unavailable", qa_old_url_status: null, qa_destination_status: null, qa_detail: "Stored redirect source or target is invalid." });
          return { status: "check_unavailable" as const, storageError: saved.error };
        }
        let verification: RedirectVerification;
        try { verification = await deps.verify(`https://${domain}${path}`, finding.suggested_target_url, domain); }
        catch { verification = { ok: false, oldUrlStatus: null, location: null, destinationStatus: null, reason: "The live redirect check could not reach the public URLs." }; }
        const status = classifyRedirectQa(verification);
        const saved = await saveQaResult(db, finding, {
          qa_checked_at: checkedAt,
          qa_status: status,
          qa_old_url_status: verification.oldUrlStatus,
          qa_destination_status: verification.destinationStatus,
          qa_detail: verification.reason.slice(0, 300),
        });
        return { status, storageError: saved.error };
      });
      const storageErrors = checked.filter(item => item.storageError).length;
      const counts = Object.fromEntries(["healthy", "source_not_redirecting", "redirect_chain_or_loop", "destination_not_200", "check_unavailable"].map(status => [status, checked.filter(item => item.status === status).length]));
      if (storageErrors) return Response.json({ error: "Redirect QA results could not all be saved.", processed: checked.length, storageErrors }, { status: 503, headers: { "Cache-Control": "no-store" } });
      return Response.json({ processed: checked.length, counts, checkedAt }, { headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "Redirect QA run is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  };
}
