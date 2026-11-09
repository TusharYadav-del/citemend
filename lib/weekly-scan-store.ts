import "server-only";
import { randomUUID } from "node:crypto";
import { createServerDatabase } from "./supabase-server";
import { grantsProAccess, isMissingBetaColumns } from "./subscription";
import { validateAuditInput } from "./audit-pipeline";
import type { Database } from "./database.types";
import type { DigestLink } from "./email";

export const DEFAULT_WEEKLY_PROMPT = "What are the best solutions for my business, and where can I find their pricing and documentation?";
type Run = Database["public"]["Tables"]["weekly_scan_runs"]["Row"];
export type WeeklyJob = Database["public"]["Tables"]["weekly_scan_jobs"]["Row"];
export type WeeklyDigest = Database["public"]["Tables"]["weekly_scan_digests"]["Row"];
export type WeeklyTarget = { user_id: string; domain: string; buyer_prompt: string };
type DatabaseClient = ReturnType<typeof createServerDatabase>;
const PAGE_SIZE = 500;
const LEASE_MS = 10 * 60_000;

export class WeeklyScanStore {
  constructor(private readonly db: DatabaseClient = createServerDatabase()) {}

  async getOrCreateRun(weekStart: string): Promise<Run> {
    const { data, error } = await this.db.from("weekly_scan_runs")
      .insert({ week_start: weekStart }).select("*").single();
    if (!error && data) return data;
    if (error?.code !== "23505") throw new Error("Could not create weekly run.");
    const existing = await this.db.from("weekly_scan_runs").select("*").eq("week_start", weekStart).single();
    if (existing.error || !existing.data) throw new Error("Could not read weekly run.");
    return existing.data;
  }

  async oldestOpenRun(): Promise<Run | null> {
    const { data, error } = await this.db.from("weekly_scan_runs").select("*")
      .in("status", ["initializing", "running"]).order("week_start", { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error("Could not read weekly runs.");
    return data;
  }

  async claimInitialization(run: Run, now: Date): Promise<string | null> {
    const cutoff = now.getTime() - LEASE_MS;
    if (run.lease_token && Date.parse(run.updated_at) >= cutoff) return null;
    const token = randomUUID();
    let query = this.db.from("weekly_scan_runs").update({ lease_token: token, updated_at: now.toISOString() })
      .eq("id", run.id).eq("status", "initializing");
    query = run.lease_token ? query.eq("lease_token", run.lease_token) : query.is("lease_token", null);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw new Error("Could not claim weekly initialization.");
    return data ? token : null;
  }

  async listTargets(now: Date): Promise<WeeklyTarget[]> {
    const fallbackPrompt = process.env.WEEKLY_SCAN_PROMPT?.trim() || DEFAULT_WEEKLY_PROMPT;
    validateAuditInput({ domain: "example.com", buyerPrompt: fallbackPrompt });
    const users = new Set<string>();
    const betaDomains: WeeklyTarget[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const current = await this.db.from("subscriptions")
        .select("id,user_id,status,cancelled,ends_at,plan,current_period_end,domain").order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
      let rows;
      if (isMissingBetaColumns(current.error)) {
        const legacy = await this.db.from("subscriptions")
          .select("id,user_id,status,cancelled,ends_at").order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
        if (legacy.error) throw new Error("Could not read subscriptions.");
        rows = legacy.data ?? [];
      } else {
        if (current.error) throw new Error("Could not read subscriptions.");
        rows = current.data ?? [];
      }
      for (const row of rows) {
        if (!grantsProAccess(row, now.getTime())) {
          if ("plan" in row && row.plan === "pro_beta" && row.status === "active" && "current_period_end" in row && typeof row.current_period_end === "string" && Date.parse(row.current_period_end) <= now.getTime()) {
            const { error } = await this.db.from("subscriptions").update({ status: "expired", updated_at: now.toISOString() })
              .eq("id", row.id).eq("plan", "pro_beta").eq("status", "active").lte("current_period_end", now.toISOString());
            if (error) throw new Error("Could not expire beta subscription.");
          }
          continue;
        }
        users.add(row.user_id);
        if (!("plan" in row) || row.plan !== "pro_beta" || !("domain" in row) || typeof row.domain !== "string") continue;
        try {
          const input = validateAuditInput({ domain: row.domain, buyerPrompt: fallbackPrompt });
          betaDomains.push({ user_id: row.user_id, domain: input.domain, buyer_prompt: input.buyerPrompt });
        } catch {
          // An invalid historic beta domain is excluded from scheduled scans.
        }
      }
      if (rows.length < PAGE_SIZE) break;
    }
    if (!users.size) return [];
    const targets = new Map<string, WeeklyTarget>();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.db.from("audits").select("id,user_id,domain,buyer_prompt")
        .in("status", ["completed", "partial"]).not("user_id", "is", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("Could not read audit domains.");
      for (const row of data ?? []) {
        if (!row.user_id || !users.has(row.user_id)) continue;
        try {
          const savedPrompt = row.buyer_prompt?.trim();
          const buyerPrompt = savedPrompt && savedPrompt.length <= 4000 ? savedPrompt : fallbackPrompt;
          const input = validateAuditInput({ domain: row.domain, buyerPrompt });
          const key = JSON.stringify([row.user_id, input.domain]);
          if (!targets.has(key)) targets.set(key, { user_id: row.user_id, domain: input.domain, buyer_prompt: input.buyerPrompt });
        } catch {
          // Older invalid domain rows cannot be safely scanned.
        }
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
    for (const target of betaDomains) {
      const key = JSON.stringify([target.user_id, target.domain]);
      if (!targets.has(key)) targets.set(key, target);
    }
    return [...targets.values()];
  }

  async initialize(runId: string, lease: string, targets: WeeklyTarget[], now: Date): Promise<void> {
    for (let offset = 0; offset < targets.length; offset += 100) {
      const rows = targets.slice(offset, offset + 100).map((target) => ({ ...target, run_id: runId }));
      const { error } = await this.db.from("weekly_scan_jobs").upsert(rows, { onConflict: "run_id,user_id,domain", ignoreDuplicates: true });
      if (error) throw new Error("Could not queue weekly scans.");
    }
    const { count, error: countError } = await this.db.from("weekly_scan_jobs").select("id", { count: "exact", head: true }).eq("run_id", runId);
    if (countError || count === null) throw new Error("Could not count weekly scans.");
    const { data, error } = await this.db.from("weekly_scan_runs")
      .update({ status: "running", total_jobs: count, lease_token: null, last_error: null, updated_at: now.toISOString() })
      .eq("id", runId).eq("status", "initializing").eq("lease_token", lease).select("id").maybeSingle();
    if (error || !data) throw new Error("Weekly initialization lease was lost.");
  }

  async releaseInitialization(runId: string, lease: string): Promise<void> {
    const { error } = await this.db.from("weekly_scan_runs")
      .update({ lease_token: null, last_error: "Could not prepare weekly scan targets.", updated_at: new Date().toISOString() })
      .eq("id", runId).eq("status", "initializing").eq("lease_token", lease);
    if (error) throw new Error("Could not update weekly run log.");
  }

  async candidates(runId: string, now: Date): Promise<WeeklyJob[]> {
    const pending = await this.db.from("weekly_scan_jobs").select("*").eq("run_id", runId).eq("status", "pending")
      .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(2);
    if (pending.error) throw new Error("Could not read weekly jobs.");
    if ((pending.data?.length ?? 0) >= 2) return pending.data ?? [];
    const stale = await this.db.from("weekly_scan_jobs").select("*").eq("run_id", runId).eq("status", "running")
      .lt("started_at", new Date(now.getTime() - LEASE_MS).toISOString()).order("started_at", { ascending: true }).limit(2 - (pending.data?.length ?? 0));
    if (stale.error) throw new Error("Could not read stale weekly jobs.");
    return [...(pending.data ?? []), ...(stale.data ?? [])];
  }

  async claimJob(job: WeeklyJob, now: Date): Promise<WeeklyJob | null> {
    const token = randomUUID();
    const exhausted = job.attempts >= 3;
    let query = this.db.from("weekly_scan_jobs").update(exhausted
      ? { status: "failed", lease_token: null, finished_at: now.toISOString(), updated_at: now.toISOString(), last_error: "Scan interrupted after three attempts." }
      : { status: "running", attempts: job.attempts + 1, lease_token: token, started_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", job.id).eq("status", job.status).eq("attempts", job.attempts);
    query = job.lease_token ? query.eq("lease_token", job.lease_token) : query.is("lease_token", null);
    const { data, error } = await query.select("*").maybeSingle();
    if (error) throw new Error("Could not claim weekly job.");
    return exhausted ? null : data;
  }

  async priorAudit(job: WeeklyJob, now: Date): Promise<"saved" | "none"> {
    const { data, error } = await this.db.from("audits").select("id,user_id,domain,status,created_at")
      .eq("id", job.id).maybeSingle();
    if (error) throw new Error("Could not read previous weekly audit.");
    if (!data) return "none";
    if (data.user_id !== job.user_id || data.domain !== job.domain) throw new Error("Weekly audit identity mismatch.");
    if (["completed", "partial"].includes(data.status)) return "saved";
    if (data.status !== "pending" || Date.parse(data.created_at) >= now.getTime() - LEASE_MS) throw new Error("Previous weekly save is still in progress.");
    const deleted = await this.db.from("audits").delete().eq("id", job.id).eq("user_id", job.user_id).eq("status", "pending")
      .lt("created_at", new Date(now.getTime() - LEASE_MS).toISOString()).select("id").maybeSingle();
    if (deleted.error || !deleted.data) throw new Error("Could not recover an interrupted weekly save.");
    return "none";
  }

  async finishJob(job: WeeklyJob, status: "completed" | "skipped" | "pending" | "failed", message: string | null, now: Date): Promise<void> {
    const { data, error } = await this.db.from("weekly_scan_jobs").update({
      status, last_error: message, audit_id: status === "completed" ? job.id : null,
      lease_token: null, finished_at: status === "pending" ? null : now.toISOString(), updated_at: now.toISOString(),
    }).eq("id", job.id).eq("status", "running").eq("lease_token", job.lease_token!).select("id").maybeSingle();
    if (error || !data) throw new Error("Could not update weekly job log.");
  }

  async prepareDigests(runId: string): Promise<void> {
    const remaining = await this.db.from("weekly_scan_jobs").select("id", { count: "exact", head: true })
      .eq("run_id", runId).in("status", ["pending", "running"]);
    if (remaining.error || remaining.count === null) throw new Error("Could not read weekly job progress.");
    if (remaining.count) return;
    const users = new Set<string>();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.db.from("weekly_scan_jobs").select("user_id")
        .eq("run_id", runId).eq("status", "completed").order("user_id").range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("Could not prepare weekly email recipients.");
      for (const row of data ?? []) users.add(row.user_id);
      if (!data || data.length < PAGE_SIZE) break;
    }
    const recipients = [...users];
    for (let offset = 0; offset < recipients.length; offset += 100) {
      const { error } = await this.db.from("weekly_scan_digests").upsert(
        recipients.slice(offset, offset + 100).map((user_id) => ({ run_id: runId, user_id })),
        { onConflict: "run_id,user_id", ignoreDuplicates: true },
      );
      if (error) throw new Error("Could not queue weekly email digests.");
    }
    const { error: preparedError } = await this.db.from("weekly_scan_runs")
      .update({ digests_prepared_at: new Date().toISOString() }).eq("id", runId).eq("status", "running");
    if (preparedError) throw new Error("Could not record weekly email preparation.");
  }

  async digestCandidates(runId: string, now: Date): Promise<WeeklyDigest[]> {
    const pending = await this.db.from("weekly_scan_digests").select("*").eq("run_id", runId)
      .eq("status", "pending").order("created_at").limit(2);
    if (pending.error) throw new Error("Could not read weekly email digests.");
    if ((pending.data?.length ?? 0) >= 2) return pending.data ?? [];
    const stale = await this.db.from("weekly_scan_digests").select("*").eq("run_id", runId)
      .eq("status", "sending").lt("started_at", new Date(now.getTime() - LEASE_MS).toISOString())
      .order("started_at").limit(2 - (pending.data?.length ?? 0));
    if (stale.error) throw new Error("Could not read interrupted email digests.");
    return [...(pending.data ?? []), ...(stale.data ?? [])];
  }

  async claimDigest(digest: WeeklyDigest, now: Date): Promise<WeeklyDigest | null> {
    const token = randomUUID();
    let query = this.db.from("weekly_scan_digests").update({ status: "sending", lease_token: token, started_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", digest.id).eq("status", digest.status);
    query = digest.lease_token ? query.eq("lease_token", digest.lease_token) : query.is("lease_token", null);
    const { data, error } = await query.select("*").maybeSingle();
    if (error) throw new Error("Could not claim weekly email digest.");
    return data;
  }

  async digestLinks(digest: WeeklyDigest): Promise<DigestLink[]> {
    const run = await this.db.from("weekly_scan_runs").select("created_at").eq("id", digest.run_id).single();
    if (run.error || !run.data) throw new Error("Could not read weekly email window.");
    const links: DigestLink[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: jobs, error } = await this.db.from("weekly_scan_jobs").select("audit_id,domain")
        .eq("run_id", digest.run_id).eq("user_id", digest.user_id).eq("status", "completed")
        .order("id").range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("Could not read completed weekly audits.");
      for (const job of jobs ?? []) {
        if (!job.audit_id) continue;
        const prior = await this.db.from("audits").select("id,broken_links(cited_url)")
          .eq("user_id", digest.user_id).eq("domain", job.domain)
          .in("status", ["completed", "partial"]).lt("created_at", run.data.created_at)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (prior.error) throw new Error("Could not compare prior audit findings.");
        const previous = new Set((prior.data?.broken_links ?? []).map((link) => link.cited_url));
        const current = await this.db.from("broken_links").select("cited_url,http_status,suggested_redirect,approval_status")
          .eq("audit_id", job.audit_id).eq("http_status", 404);
        if (current.error) throw new Error("Could not read weekly 404 findings.");
        for (const link of current.data ?? []) {
          if (!previous.has(link.cited_url)) links.push({ domain: job.domain, audit_id: job.audit_id, cited_url: link.cited_url, suggested_redirect: link.suggested_redirect, approval_status: link.approval_status });
        }
      }
      if (!jobs || jobs.length < PAGE_SIZE) break;
    }
    return links;
  }

  async finishDigest(digest: WeeklyDigest, status: "sent" | "skipped" | "pending", messageId: string | null, now: Date): Promise<void> {
    const { data, error } = await this.db.from("weekly_scan_digests").update({
      status, provider_message_id: messageId, lease_token: null,
      last_error: status === "pending" ? "Email delivery failed; retry scheduled." : null,
      finished_at: status === "pending" ? null : now.toISOString(), updated_at: now.toISOString(),
    }).eq("id", digest.id).eq("status", "sending").eq("lease_token", digest.lease_token!).select("id").maybeSingle();
    if (error || !data) throw new Error("Could not update weekly email delivery.");
  }

  async finishRunIfDone(runId: string, now: Date): Promise<void> {
    const prepared = await this.db.from("weekly_scan_runs").select("digests_prepared_at")
      .eq("id", runId).single();
    if (prepared.error || !prepared.data) throw new Error("Could not read weekly email preparation.");
    if (!prepared.data.digests_prepared_at) return;
    const remaining = await this.db.from("weekly_scan_jobs").select("id", { count: "exact", head: true })
      .eq("run_id", runId).in("status", ["pending", "running"]);
    if (remaining.error || remaining.count === null) throw new Error("Could not read weekly progress.");
    if (remaining.count > 0) return;
    const unsent = await this.db.from("weekly_scan_digests").select("id", { count: "exact", head: true })
      .eq("run_id", runId).in("status", ["pending", "sending"]);
    if (unsent.error || unsent.count === null) throw new Error("Could not read weekly email progress.");
    if (unsent.count > 0) return;
    const failures = await this.db.from("weekly_scan_jobs").select("id", { count: "exact", head: true })
      .eq("run_id", runId).eq("status", "failed");
    if (failures.error || failures.count === null) throw new Error("Could not read weekly failures.");
    const { error } = await this.db.from("weekly_scan_runs")
      .update({ status: failures.count ? "partial" : "completed", finished_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", runId).eq("status", "running");
    if (error) throw new Error("Could not finish weekly run log.");
  }
}
