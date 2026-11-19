import "server-only";
import { load } from "cheerio";
import { assertPublicUrl, publicFetch } from "./public-http";
import { fetchSitemapUrls } from "./seo";

export const EXTRACTABILITY_BOTS = ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"] as const;
export type ExtractabilityBot = typeof EXTRACTABILITY_BOTS[number];
type RobotsRule = { path: string; allow: boolean };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };
export type ExtractabilityPage = {
  url: string; httpStatus: number | null; serverRendered: boolean; navigationLinkCount: number;
  wordCount: number;
  answerCapsule: { found: boolean; wordCount: number; withinFirst30Percent: boolean };
  quotationDensity: number; statisticDensity: number; keywordStuffing: { detected: boolean; repeatedTerm: string | null; ratio: number };
  updatedAt: string | null; staleOver90Days: boolean;
  robots: Record<ExtractabilityBot, boolean | null>;
};
export type ExtractabilityFix = { id: string; title: string; impact: 1 | 2 | 3; effort: 1 | 2 | 3; priority: number; tier: 1 | 2; evidence: string; action: string };

const STOP_WORDS = new Set("about after again all also an and are as at be been before being between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just more most my no nor not of off on once only or other our out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your".split(" "));

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup = { agents: [], rules: [] };
  let hasRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent" && value) {
      if (hasRule) {
        if (current.agents.length) groups.push(current);
        current = { agents: [], rules: [] };
        hasRule = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current.agents.length) {
      hasRule = true;
      if (value) current.rules.push({ path: value, allow: key === "allow" });
    }
  }
  if (current.agents.length) groups.push(current);
  return groups;
}

export function robotsAllowsAgent(text: string, url: string, agent: ExtractabilityBot): boolean {
  let target: URL;
  try { target = new URL(url); } catch { return false; }
  const groups = parseRobots(text);
  const token = agent.toLowerCase();
  const matching = groups.filter(group => group.agents.some(value => value === token));
  const applicable = matching.length ? matching : groups.filter(group => group.agents.includes("*"));
  const rules = applicable.flatMap(group => group.rules).filter(rule => target.pathname.startsWith(rule.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return rules[0]?.allow ?? true;
}

function contentMetrics(url: string, html: string, status: number | null, lastModified: string | null, now: number): Omit<ExtractabilityPage, "robots"> {
  const $ = load(html);
  const navigationLinkCount = $("nav a[href]").length;
  $("script,style,nav,footer,header,noscript,svg,template,iframe,form,[hidden],[aria-hidden='true']").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const wordCount = words.length;
  const capsule = $("p,li,h1,h2,h3,article").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get().map(value => ({ text: value, start: text.indexOf(value), words: value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0 })).find(block => block.words >= 40 && block.words <= 60 && block.start >= 0 && block.start / Math.max(text.length, 1) <= 0.3);
  const quotedWords = [...text.matchAll(/[“"]([^“”"]{2,500})[”"]/g)].reduce((sum, match) => sum + (match[1].match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0);
  const numbers = [...text.matchAll(/\b\d+(?:[.,]\d+)?%?\b/g)].length;
  const terms = words.map(word => word.toLowerCase()).filter(word => word.length >= 4 && !STOP_WORDS.has(word));
  const frequencies = new Map<string, number>();
  for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const [repeatedTerm, repeatedCount] = [...frequencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [null, 0];
  const stuffingRatio = terms.length ? repeatedCount / terms.length : 0;
  const updatedAt = lastModified ?? $("time[datetime],meta[property='article:modified_time'],meta[name='last-modified']").first().attr("datetime") ?? $("meta[property='article:modified_time'],meta[name='last-modified']").first().attr("content") ?? null;
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  return {
    url, httpStatus: status,
    serverRendered: status === 200 && text.replace(/[^\p{L}\p{N}]/gu, "").length >= 80,
    navigationLinkCount,
    wordCount,
    answerCapsule: { found: !!capsule, wordCount: capsule?.words ?? 0, withinFirst30Percent: !!capsule },
    quotationDensity: wordCount ? Math.round(quotedWords / wordCount * 1000) / 10 : 0,
    statisticDensity: wordCount ? Math.round(numbers / wordCount * 1000) / 10 : 0,
    keywordStuffing: { detected: repeatedCount >= 5 && stuffingRatio >= 0.03, repeatedTerm, ratio: Math.round(stuffingRatio * 1000) / 10 },
    updatedAt, staleOver90Days: Number.isFinite(timestamp) && now - timestamp > 90 * 86_400_000,
  };
}

export function analyzeExtractabilityPage(input: { url: string; html: string; status?: number | null; lastModified?: string | null; robotsText?: string | null; now?: number }): ExtractabilityPage {
  const page = contentMetrics(input.url, input.html, input.status ?? 200, input.lastModified ?? null, input.now ?? Date.now());
  const robots = Object.fromEntries(EXTRACTABILITY_BOTS.map(bot => [bot, input.robotsText === null || input.robotsText === undefined ? null : robotsAllowsAgent(input.robotsText, input.url, bot)])) as Record<ExtractabilityBot, boolean | null>;
  return { ...page, robots };
}

export function rankExtractabilityFixes(pages: ExtractabilityPage[]): ExtractabilityFix[] {
  const fixes: ExtractabilityFix[] = [];
  const pageUrls = pages.map(page => page.url);
  const blocked = EXTRACTABILITY_BOTS.filter(bot => pages.some(page => page.robots[bot] === false));
  if (blocked.length) fixes.push({ id: "crawler_access", title: "Review AI crawler access", impact: 3, effort: 1, priority: 30, tier: 1, evidence: `${blocked.join(", ")} are disallowed on one or more scanned pages.`, action: "Review robots.txt rules for the affected page paths and crawler groups." });
  const noSsr = pages.filter(page => page.httpStatus === 200 && !page.serverRendered);
  if (noSsr.length) fixes.push({ id: "ssr_content", title: "Deliver readable page content in HTML", impact: 3, effort: 2, priority: 15, tier: 1, evidence: `${noSsr.length} page(s) returned HTTP 200 but had little extractable body text.`, action: "Render the primary answer content in the initial HTML response." });
  const navHeavy = pages.filter(page => page.navigationLinkCount >= 60);
  if (navHeavy.length) fixes.push({ id: "navigation_bloat", title: "Reduce navigation link count", impact: 2, effort: 2, priority: 10, tier: 2, evidence: `${navHeavy.length} page(s) have at least 60 links inside navigation.`, action: "Keep navigation focused and move secondary links into contextual sections." });
  const missingCapsule = pages.filter(page => page.serverRendered && !page.answerCapsule.found);
  if (missingCapsule.length) fixes.push({ id: "answer_capsule", title: "Add a concise answer capsule near the start", impact: 3, effort: 2, priority: 15, tier: 1, evidence: `${missingCapsule.length} readable page(s) have no 40–60 word sentence in the first 30% of visible content.`, action: "Add a self-contained 40–60 word answer near the beginning of the page." });
  const stale = pages.filter(page => page.staleOver90Days);
  if (stale.length) fixes.push({ id: "freshness", title: "Review stale page content", impact: 3, effort: 2, priority: 15, tier: 1, evidence: `${stale.length} page(s) expose a modified timestamp older than 90 days.`, action: "Verify key claims and update the visible modified date only after a real content review." });
  const lowCitations = pages.filter(page => page.serverRendered && page.wordCount > 0 && page.quotationDensity < 1.5);
  if (lowCitations.length) fixes.push({ id: "quotation_density", title: "Add sourced quotations where useful", impact: 2, effort: 2, priority: 10, tier: 2, evidence: `${lowCitations.length} readable page(s) have quotation density below 1.5% of visible words.`, action: "Consider adding a short attributed quotation when it supports a factual point." });
  const lowStats = pages.filter(page => page.serverRendered && page.wordCount > 0 && page.statisticDensity < 0.5);
  if (lowStats.length) fixes.push({ id: "statistic_density", title: "Support claims with concrete statistics", impact: 2, effort: 2, priority: 10, tier: 2, evidence: `${lowStats.length} readable page(s) have fewer than 0.5 numeric facts per 100 visible words.`, action: "Add current, sourced figures when they help explain measurable outcomes." });
  const stuffing = pages.filter(page => page.keywordStuffing.detected);
  if (stuffing.length) fixes.push({ id: "keyword_stuffing", title: "Reduce repeated keyword phrasing", impact: 2, effort: 1, priority: 20, tier: 1, evidence: `${stuffing.length} page(s) repeat a non-stopword term at least five times and at least 3% of content terms.`, action: "Rewrite repeated phrasing for clear, natural explanations." });
  return fixes.map(fix => ({ ...fix, priority: Math.round(fix.impact / fix.effort * 10), tier: (fix.impact / fix.effort * 10) >= 15 ? 1 as const : 2 as const, evidence: `${fix.evidence} Pages: ${pageUrls.filter(url => pages.some(page => page.url === url && (
    fix.id === "crawler_access" ? EXTRACTABILITY_BOTS.some(bot => page.robots[bot] === false) :
    fix.id === "ssr_content" ? page.httpStatus === 200 && !page.serverRendered :
    fix.id === "navigation_bloat" ? page.navigationLinkCount >= 60 :
    fix.id === "answer_capsule" ? page.serverRendered && !page.answerCapsule.found :
    fix.id === "freshness" ? page.staleOver90Days :
    fix.id === "quotation_density" ? page.serverRendered && page.wordCount > 0 && page.quotationDensity < 1.5 :
    fix.id === "statistic_density" ? page.serverRendered && page.wordCount > 0 && page.statisticDensity < 0.5 : page.keywordStuffing.detected
  ))).slice(0, 5).join(", ")}` })).sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

async function readBoundedText(response: Response, limit: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export async function runExtractabilityAudit(domain: string, now = Date.now()) {
  const origin = assertPublicUrl(domain.includes("://") ? domain : `https://${domain}`);
  const [sitemapResult, robotsResult, llmsResult] = await Promise.allSettled([
    fetchSitemapUrls(origin.hostname),
    publicFetch(new URL("/robots.txt", origin), { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000), headers: { Accept: "text/plain" } }),
    publicFetch(new URL("/llms.txt", origin), { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000), headers: { Accept: "text/plain" } }),
  ]);
  if (robotsResult.status === "fulfilled" && robotsResult.value.status !== 200) await robotsResult.value.body?.cancel();
  const robotsText = robotsResult.status === "fulfilled" && robotsResult.value.status === 200 ? await readBoundedText(robotsResult.value, 256_000) : robotsResult.status === "fulfilled" && robotsResult.value.status === 404 ? "" : null;
  const llmsTxtStatus = llmsResult.status === "fulfilled" ? llmsResult.value.status : null;
  if (llmsResult.status === "fulfilled") await llmsResult.value.body?.cancel();
  const sitemapUrls = sitemapResult.status === "fulfilled" ? sitemapResult.value : [];
  const candidates = [...new Set([new URL("/", origin).href, ...sitemapUrls].flatMap(value => {
    try { const url = assertPublicUrl(value); const host = url.hostname.toLowerCase().replace(/^www\./, ""); const rootHost = origin.hostname.toLowerCase().replace(/^www\./, ""); if (host !== rootHost) return []; url.hash = ""; return [url.href]; }
    catch { return []; }
  }))].slice(0, 12);
  const pageRows = await mapLimited(candidates, 3, async url => {
    try {
      const response = await publicFetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(7000), headers: { Accept: "text/html" } });
      if (response.status !== 200 || !/text\/html/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); return analyzeExtractabilityPage({ url, html: "", status: response.status, robotsText }); }
      const reader = response.body?.getReader(); if (!reader) return analyzeExtractabilityPage({ url, html: "", status: null, robotsText });
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1_000_000) { await reader.cancel(); return analyzeExtractabilityPage({ url, html: "", status: null, robotsText }); } chunks.push(value); } } finally { reader.releaseLock(); }
      return analyzeExtractabilityPage({ url, html: Buffer.concat(chunks).toString("utf8"), status: response.status, lastModified: response.headers.get("last-modified"), robotsText, now });
    } catch { return analyzeExtractabilityPage({ url, html: "", status: null, robotsText, now }); }
  });
  const pages = pageRows;
  return { domain: origin.hostname, pages, robotsAvailable: robotsText !== null, llmsTxtStatus, sitemapAvailable: sitemapResult.status === "fulfilled", scannedPageCount: pages.length, fixes: rankExtractabilityFixes(pages), limits: ["This deterministic sample covers the homepage and up to 11 sitemap URLs.", "A present /llms.txt file is a discovery convention; crawler permissions are evaluated from robots.txt.", "Content heuristics do not predict or guarantee model retrieval, ranking, or citations."] };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; results[index] = await fn(items[index]); } }));
  return results;
}
