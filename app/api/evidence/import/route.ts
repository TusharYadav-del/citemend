import { auth } from "@clerk/nextjs/server";
import { readRequestJson } from "@/lib/read-request-json";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { verifyUrl } from "@/lib/seo";
import { fetchSitemapUrls } from "@/lib/seo";
import { matchSitemapUrls } from "@/lib/sitemap-embeddings";
import { groupRecoverySignals } from "@/lib/recovery/normalize";
import { evaluateRecoveryCandidate, hasCommercialTopicEquivalence } from "@/lib/recovery/guardrails";

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
              if (target.hostname === domain && checked.state === "200" && checked.httpStatus === 200 && checked.finalUrl && new URL(checked.finalUrl).hostname === domain) {
                const confidence = Math.round(candidate.similarity * 100);
                const guardrail = evaluateRecoveryCandidate({ deadUrl: item.url, suggestedTargetUrl: checked.finalUrl, sourceStatus: item.httpStatus ?? 404, targetStatus: checked.httpStatus, confidenceScore: confidence, semanticEquivalent: confidence >= 65, commerciallyEquivalent: hasCommercialTopicEquivalence(item.url, checked.finalUrl) });
                if (guardrail.classification === "recoverable_equivalent") verified.push({ url: checked.finalUrl, similarity: candidate.similarity });
              }
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
      const response = await db.from("broken_links").insert(inserts).select("id,cited_url");
      if (response.error) return Response.json({ error: "HTTP checks were recorded, but broken URL recovery rows could not be saved." }, { status: 503 });
      saved = response.data?.length ?? inserts.length;
      const ids = new Map((response.data ?? []).map(row => [row.cited_url, row.id]));
      const groups = new Map(groupRecoverySignals(broken.map(item => ({ url: item.url, kind: "citation" }))).map(group => [group.normalized_path, group]));
      const recoveryRows = [...groups.values()].map(group => {
        const related = broken.map((item, index) => ({ item, row: inserts[index] })).filter(({ item }) => groupRecoverySignals([{ url: item.url }])[0].normalized_path === group.normalized_path);
        const evaluations = related.map(({ item, row }) => ({ item, row, result: evaluateRecoveryCandidate({ deadUrl: item.url, suggestedTargetUrl: row.suggested_redirect, sourceStatus: row.http_status, targetStatus: row.suggested_redirect ? 200 : null, confidenceScore: row.match_confidence, semanticEquivalent: (row.match_confidence ?? 0) >= 65, commerciallyEquivalent: !!row.suggested_redirect && hasCommercialTopicEquivalence(item.url, row.suggested_redirect) }) }));
        const selected = evaluations.find(entry => entry.result.classification === "chain_or_loop_risk") ?? evaluations.find(entry => entry.result.classification === "recoverable_equivalent") ?? evaluations[0];
        const rejectedSoft404 = evaluations.filter(entry => entry.result.rejected_soft_404).length;
        const blockedLoops = evaluations.filter(entry => entry.result.blocked_loop).length;
        return { audit_id: auditRow.id, broken_link_id: ids.get(selected.item.url) ?? null, domain, finding_type: "dead_url" as const, normalized_path: group.normalized_path, signal_evidence: { observed_404_visits: 0, external_referrers: 0, citation_snapshots: group.citation_snapshots, user_agent_verified: false, priority_score: group.priority_score, url_variants: related.map(entry => entry.item.url), rejected_soft_404_count: rejectedSoft404, blocked_loop_count: blockedLoops }, guardrail_classification: selected.result.classification, approval_status: "pending_human_review" as const, suggested_target_url: selected.result.classification === "recoverable_equivalent" ? selected.row.suggested_redirect : null, confidence_score: selected.result.confidence_score, match_reason: selected.result.match_reason, rejected_soft_404_count: rejectedSoft404, blocked_loop_count: blockedLoops };
      });
      const recoverySaved = await db.from("recovery_findings").insert(recoveryRows);
      if (recoverySaved.error) return Response.json({ error: "Recovery candidates were checked, but their guardrail records could not be saved." }, { status: 503 });
    }
    return Response.json({ evidenceCategory: "Recorded Platform / Provider Observation", importedProviderRecord: true, provider, model, locale, observedAt, checked: checks, ownDomainBrokenCount: broken.length, recoveryRowsCreated: saved, externalBrokenCount: checks.filter(item => !ownDomainUrls.includes(item) && (item.state === "404" || item.state === "410")).length, note: "Imported provider details are customer supplied. HTTP states below were checked by CiteMend. External publisher URLs are not eligible redirect sources. Similarity ranks candidate relevance; it is not a probability. Redirect candidates remain pending human approval." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Evidence import is temporarily unavailable." }, { status: 503 }); }
}
