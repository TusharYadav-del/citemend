import { extractTextUrls, normalizeCitationUrl } from "./citation-urls";

export type CitationGap = { buyerPrompt: string; competitorUrls: string[]; provider: string };
const host = (value: string) => new URL(value).hostname.replace(/^www\./, "");
export function detectCitationGap(domain: string, buyerPrompt: string, text: string, provider: string): CitationGap | null {
  const target = domain.replace(/^www\./, "");
  const urls = [...new Set(extractTextUrls(text))];
  if (text.toLowerCase().includes(domain.toLowerCase()) || urls.some(url => host(url) === target || host(url).endsWith(`.${target}`))) return null;
  const competitorUrls = urls.filter(url => { const h = host(url); return h !== target && !h.endsWith(`.${target}`); }).slice(0, 5);
  return competitorUrls.length ? { buyerPrompt, competitorUrls, provider } : null;
}
export function parseCitationGap(value: unknown): CitationGap | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.buyerPrompt !== "string" || !v.buyerPrompt.trim() || v.buyerPrompt.length > 4000 || typeof v.provider !== "string" || !Array.isArray(v.competitorUrls) || v.competitorUrls.length < 1 || v.competitorUrls.length > 5) return null;
  if (!v.competitorUrls.every(url => typeof url === "string" && normalizeCitationUrl(url))) return null;
  return v as CitationGap;
}
