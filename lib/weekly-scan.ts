import "server-only";
import { timingSafeEqual } from "node:crypto";
import { runAudit } from "./audit-pipeline";
import { persistAudit } from "./audit-store";
import { runCitationProbe } from "./citation-probe";
import { sendWeeklyDigest } from "./email";
import { hasProSubscription } from "./subscription";
import { WeeklyScanStore, type WeeklyDigest, type WeeklyJob } from "./weekly-scan-store";
import { createServerDatabase } from "./supabase-server";
import { generateLlmsTxt, type DeprecatedPath, type LlmsPage } from "./llms-txt";
import { notifyWeeklyFindings } from "./weekly-alerts";

type WeeklyRun = Awaited<ReturnType<WeeklyScanStore["getOrCreateRun"]>>;
type WeeklyStore = Pick<WeeklyScanStore, "getOrCreateRun" | "oldestOpenRun" | "claimInitialization" | "listTargets" | "initialize" | "releaseInitialization" | "candidates" | "claimJob" | "priorAudit" | "finishJob" | "prepareDigests" | "digestCandidates" | "claimDigest" | "digestLinks" | "finishDigest" | "finishRunIfDone">;
type Dependencies = {
  secret?: () => string | undefined;
  store?: () => WeeklyStore;
  hasPro?: typeof hasProSubscription;
  scan?: (job: WeeklyJob) => Promise<void>;
  sendDigest?: typeof sendWeeklyDigest;
  now?: () => Date;
  defer?: (task: () => Promise<void>) => void;
};

export function indiaWeekStart(now: Date): string {
  const local = new Date(now.getTime() + 330 * 60_000);
  const weekday = local.getUTCDay();
  local.setUTCDate(local.getUTCDate() - (weekday + 6) % 7);
  return local.toISOString().slice(0, 10);
}

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function safeJobError(error: unknown): string {
  if (error && typeof error === "object" && "status" in error && error.status === 429) {
    return "Groq rate limit or quota exceeded.";
  }
  return "Subscription check, Groq/Tavily scan, or audit save failed.";
}

export async function runWeeklyAudit(job: WeeklyJob, dependencies: { execute?: typeof runAudit; probe?: typeof runCitationProbe; save?: typeof persistAudit } = {}): Promise<void> {
  if (process.env.AUDIT_PERSISTENCE_MODE === "local") throw new Error("Weekly scans require database persistence.");
  const execute = dependencies.execute ?? runAudit;
  const probe = dependencies.probe ?? runCitationProbe;
  const save = dependencies.save ?? persistAudit;
  const report = await execute(
    { domain: job.domain, buyerPrompt: job.buyer_prompt },
    { probe, save: (value, owner) => save(value, owner, undefined, job.id) },
    job.user_id,
  );
  if (report.persistence.status !== "saved" || report.auditId !== job.id) throw new Error("Weekly audit could not be saved.");
  try { await notifyWeeklyFindings(job.user_id, job.id, report); }
  catch { console.warn("Weekly alert processing was unavailable."); }
  // The weekly scan already persisted fresh 404s and redirect suggestions. Refresh
  // the public document from that evidence without failing the successful scan if
  // Gemini or the optional column is not available yet.
  try {
    const db = createServerDatabase();
    const [pagesResult, brokenResult] = await Promise.all([
      db.from("sitemap_pages").select("url,page_title").eq("domain", job.domain).order("updated_at", { ascending: false }).limit(30),
      db.from("broken_links").select("cited_url,suggested_redirect").eq("audit_id", job.id).eq("http_status", 404).limit(100),
    ]);
    if (pagesResult.error || brokenResult.error) throw pagesResult.error ?? brokenResult.error;
    const deprecated = (brokenResult.data ?? []).map((link) => ({ url: link.cited_url, replacement: link.suggested_redirect })) as DeprecatedPath[];
    const generated = await generateLlmsTxt(job.domain, (pagesResult.data ?? []) as LlmsPage[], deprecated);
    const { error } = await db.from("audits").update({ llms_txt_content: generated.llmsTxt }).eq("id", job.id).eq("user_id", job.user_id);
    if (error) throw error;
  } catch (error) {
    console.warn("Weekly scan saved, but hosted llms.txt could not be refreshed.", error instanceof Error ? error.message : "Unknown error");
  }
}

export function createWeeklyScanHandler(dependencies: Dependencies = {}) {
  const secret = dependencies.secret ?? (() => process.env.CRON_SECRET?.trim());
  const storeFactory = dependencies.store ?? (() => new WeeklyScanStore());
  const hasPro = dependencies.hasPro ?? hasProSubscription;
  const scan = dependencies.scan ?? runWeeklyAudit;
  const sendDigest = dependencies.sendDigest ?? sendWeeklyDigest;
  const now = dependencies.now ?? (() => new Date());

  return async function handleWeeklyScan(request: Request): Promise<Response> {
    const key = secret();
    if (!key) return Response.json({ error: "Weekly scans are not configured." }, { status: 503 });
    if (!authorized(request.headers.get("authorization"), key)) return Response.json({ error: "Unauthorized." }, { status: 401 });

    let action = "start";
    if (request.method === "POST" && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1024) { await reader.cancel().catch(() => {}); return Response.json({ error: "Invalid request." }, { status: 413 }); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      if (bytes) {
        try {
          const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
          if (!payload || typeof payload !== "object" || !("action" in payload) || typeof payload.action !== "string") throw new Error();
          action = payload.action;
        } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
      }
    }
    if (action !== "start" && action !== "drain") return Response.json({ error: "Invalid request." }, { status: 400 });

    const perform = async (): Promise<Response> => {
      try {
        const store = storeFactory();
        const currentTime = now();
        const run: WeeklyRun | null = action === "start"
          ? await store.getOrCreateRun(indiaWeekStart(currentTime))
          : await store.oldestOpenRun();
        if (!run) return Response.json({ status: "idle", processed: 0 });
        if (run.status === "completed" || run.status === "partial") return Response.json({ status: run.status, processed: 0 });

        if (run.status === "initializing") {
          const lease = await store.claimInitialization(run, currentTime);
          if (!lease) return Response.json({ status: "initializing", processed: 0 });
          try {
            const targets = await store.listTargets(currentTime);
            await store.initialize(run.id, lease, targets, now());
          } catch {
            await store.releaseInitialization(run.id, lease).catch(() => {});
            return Response.json({ error: "Weekly scan initialization failed; it will be retried." }, { status: 503 });
          }
        }

        const candidates = await store.candidates(run.id, now());
        let processed = 0;
        await Promise.all(candidates.map(async (candidate) => {
          const job = await store.claimJob(candidate, now());
          if (!job) return;
          try {
            if (!await hasPro(job.user_id)) {
              await store.finishJob(job, "skipped", "Subscription is no longer eligible.", now());
            } else if (await store.priorAudit(job, now()) === "saved") {
              await store.finishJob(job, "completed", null, now());
            } else {
              await scan(job);
              await store.finishJob(job, "completed", null, now());
            }
          } catch (error) {
            await store.finishJob(job, job.attempts >= 3 ? "failed" : "pending", safeJobError(error), now());
          }
          processed++;
        }));
        await store.prepareDigests(run.id);
        const digests = await store.digestCandidates(run.id, now());
        await Promise.all(digests.map(async (candidate: WeeklyDigest) => {
          const digest = await store.claimDigest(candidate, now());
          if (!digest) return;
          try {
            if (!await hasPro(digest.user_id)) {
              await store.finishDigest(digest, "skipped", null, now());
              return;
            }
            const links = await store.digestLinks(digest);
            if (!links.length) {
              await store.finishDigest(digest, "skipped", null, now());
              return;
            }
            const messageId = await sendDigest(digest.user_id, digest.id, links);
            await store.finishDigest(digest, "sent", messageId, now());
          } catch {
            await store.finishDigest(digest, "pending", null, now());
          }
        }));
        await store.finishRunIfDone(run.id, now());
        return Response.json({ status: "processed", processed });
      } catch {
        return Response.json({ error: "Weekly scan service is temporarily unavailable." }, { status: 503 });
      }
    };

    if (dependencies.defer) {
      dependencies.defer(async () => {
        const result = await perform();
        if (!result.ok) console.error("Weekly scan execution failed; check the run logs.");
      });
      return Response.json({ status: "accepted" }, { status: 202 });
    }
    return perform();
  };
}
