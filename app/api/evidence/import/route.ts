import { auth } from "@clerk/nextjs/server";
import { readRequestJson } from "@/lib/read-request-json";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { verifyUrl } from "@/lib/seo";
import { fetchSitemapUrls } from "@/lib/seo";
import { matchSitemapUrls } from "@/lib/sitemap-embeddings";

type ImportBody = { auditId?: unknown; urls?: unknown; prompt?: unknown; provider?: unknown; model?: unknown; locale?: unknown; rawAnswer?: unknown };
function validUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId) return Response.json({ error: "Sign in to import citation evidence." }, { status: 401 });
  const parsed = await readRequestJson(request, 128_000);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return Response.json({ error: "Send citation evidence as JSON." }, { status: parsed.kind === "too_large" ? 413 : 400 });
  const input = parsed.value as ImportBody;
  if (typeof input.auditId !== "string" || !Array.isArray(input.urls) || input.urls.length < 1 || input.urls.length > 50 || !input.urls.every(validUrl)) return Response.json({ error: "Provide an audit ID and 1–50 valid HTTP(S) citation URLs." }, { status: 400 });
  const uniqueUrls = [...new Set(input.urls.map(value => (value as string).trim()))];
  const provider = typeof input.provider === "string" && input.provider.trim() ? input.provider.trim().slice(0, 100) : "External citation import";
  const prompt = typeof input.prompt === "string" && input.prompt.trim() ? input.prompt.trim().slice(0, 4000) : "Imported citation evidence";
  const model = typeof input.model === "string" && input.model.trim() ? input.model.trim().slice(0, 120) : "customer-supplied-record";
  const locale = typeof input.locale === "string" && input.locale.trim() ? input.locale.trim().slice(0, 32) : "not_provided";
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!["owner", "admin", "editor"].includes(access.role)) return Response.json({ error: "Editor access is required to import evidence." }, { status: 403 });
    const audit = await db.from("audits").select("id,domain").eq("id", input.auditId).in("user_id", access.ownerUserIds).maybeSingle();
    if (audit.error || !audit.data) return Response.json({ error: "Audit not found in this workspace." }, { status: 404 });
    const auditRow = audit.data;
    const domain = auditRow.domain.toLowerCase();
    const observedAt = new Date().toISOString();
    const rawAnswer = typeof input.rawAnswer === "string" ? input.rawAnswer.slice(0, 100_000) : `Customer-imported citation URL list from ${provider}. Provider/model observation details are customer supplied and were not independently verified by CiteMend.`;
    const observation = await db.from("ai_observation_evidence").insert({ audit_id: auditRow.id, domain, prompt_query: prompt, prompt_version: "external-import-v1", provider, model_name: model, search_method: "customer_import", locale, raw_answer: rawAnswer, extracted_urls_json: uniqueUrls, sample_size: 1, observation_confidence: null, job_status: "completed", observed_at: observedAt }).select("id").single();
    if (observation.error || !observation.data) return Response.json({ error: "Could not persist the imported observation." }, { status: 503 });

    const checks = await Promise.all(uniqueUrls.map(async url => ({ url, ...(await verifyUrl(url)) })));
    const ownDomainUrls = checks.filter(item => { try { const host = new URL(item.url).hostname; return host === domain || host.endsWith(`.${domain}`); } catch { return false; } });
    const broken = ownDomainUrls.filter(item => item.state === "404" || item.state === "410");
    const mappings = new Map<string, { url: string; similarity: number }[]>();
    if (broken.length) {
      try {
        const sitemap = await fetchSitemapUrls(domain);
        const candidates = await matchSitemapUrls(domain, broken.map(item => item.url), sitemap);
        for (const item of broken) {
          const verified = [] as { url: string; similarity: number }[];
          for (const candidate of (candidates.get(item.url) ?? []).slice(0, 5)) {
            const checked = await verifyUrl(candidate.url);
            try {
              const target = new URL(candidate.url);
              if (target.hostname === domain && checked.state === "200" && checked.finalUrl && new URL(checked.finalUrl).hostname === domain) verified.push({ url: checked.finalUrl, similarity: candidate.similarity });
            } catch { /* malformed or cross-host targets are excluded */ }
          }
          mappings.set(item.url, verified);
        }
      } catch { /* A semantic service outage does not discard imported HTTP checks. */ }
    }
    const inserts = broken.map(item => {
      const match = (mappings.get(item.url) ?? []).sort((a, b) => b.similarity - a.similarity)[0];
      return { audit_id: auditRow.id, cited_url: item.url, http_status: item.httpStatus ?? (item.state === "410" ? 410 : 404), url_state: item.state, suggested_redirect: match?.url ?? null, match_confidence: match ? Math.round(match.similarity * 10000) / 100 : null, match_evidence_reason: match ? `pgvector similarity ranking signal ${match.similarity.toFixed(3)}; destination independently returned HTTP 200. Human preview, safety checks, and approval are still required.` : "Imported own-domain URL returned 404/410. No live semantic replacement was verified; manual mapping is required.", approval_status: "pending_review" as const };
    });
    let saved = 0;
    if (inserts.length) {
      const response = await db.from("broken_links").insert(inserts).select("id");
      if (response.error) return Response.json({ error: "HTTP checks were recorded, but broken URL recovery rows could not be saved." }, { status: 503 });
      saved = response.data?.length ?? inserts.length;
    }
    return Response.json({ evidenceCategory: "Recorded Platform / Provider Observation", importedProviderRecord: true, provider, model, locale, observedAt, checked: checks, ownDomainBrokenCount: broken.length, recoveryRowsCreated: saved, externalBrokenCount: checks.filter(item => !ownDomainUrls.includes(item) && (item.state === "404" || item.state === "410")).length, note: "Imported provider details are customer supplied. HTTP states below were checked by CiteMend. External publisher URLs are not eligible redirect sources. Similarity ranks candidate relevance; it is not a probability. Redirect candidates remain pending human approval." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Evidence import is temporarily unavailable." }, { status: 503 }); }
}
