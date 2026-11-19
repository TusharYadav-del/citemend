export const CLAIM_ISSUE_CODES = ["F1_fabricated_fact", "F2_ungrounded_claim", "F3_format_violation", "F4_instruction_deviation", "F5_stale_information", "F6_bad_citation"] as const;
export type ClaimIssueCode = typeof CLAIM_ISSUE_CODES[number];
export type CitationMetadata = { title: string | null; authors: string[]; year: number | null; venue: string | null; url: string | null; doi: string | null; arxiv_id: string | null; pmid: string | null };
export type AtomicClaim = { text: string; index: number; citationUrls: string[]; issues: { code: ClaimIssueCode; confidence: "signal" | "review"; evidence: string }[] };
const DOI = /\b(?:https?:\/\/doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[\w.()/:;-]+)\b/ig;
const PMID = /\bPMID\s*:?\s*(\d{5,9})\b/ig;
const ARXIV = /\b(?:arXiv\s*:?\s*)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/ig;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/ig;

function cleanUrl(value: string): string | null {
  try { const url = new URL(value.replace(/[.,;:!?]+$/, "")); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null; url.hash = ""; return url.href; } catch { return null; }
}

export function normalizeCitationMetadata(text: string, allowedUrls: string[] = []): CitationMetadata {
  const find = (regex: RegExp) => { regex.lastIndex = 0; return regex.exec(text)?.[1] ?? null; };
  const doiRaw = find(DOI);
  const yearRaw = text.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const quotedTitle = text.match(/[“"]([^”"]{12,240})[”"]/ )?.[1] ?? null;
  const explicit = [...text.matchAll(URL_PATTERN)].map(match => cleanUrl(match[0])).filter((value): value is string => !!value);
  const url = [...explicit, ...allowedUrls.map(cleanUrl).filter((value): value is string => !!value)].find(value => value.includes("doi.org") || value.includes("pubmed") || value.includes("arxiv.org")) ?? explicit[0] ?? allowedUrls.map(cleanUrl).find((value): value is string => !!value) ?? null;
  const authorLine = text.match(/^\s*([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2}(?:,\s*[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2}){1,5})\s*[.(]/u)?.[1];
  const authors = authorLine ? authorLine.split(/,\s*/).slice(0, 6) : [];
  const venue = text.match(/\b(?:Proceedings of [^.;]{3,100}|Journal of [^.;]{3,100}|Nature|Science|ACM Computing Surveys)\b/i)?.[0] ?? null;
  return { title: quotedTitle, authors, year: yearRaw ? Number(yearRaw) : null, venue, url, doi: doiRaw?.replace(/[.,;:!?]+$/, "") ?? null, arxiv_id: find(ARXIV), pmid: find(PMID) };
}

function splitAtomicSentences(answer: string): string[] {
  return answer.replace(/\r/g, "").split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9“"([])/u).map(value => value.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(value => value.length >= 8).slice(0, 80);
}

function issue(code: ClaimIssueCode, evidence: string, confidence: "signal" | "review" = "signal") { return { code, confidence, evidence }; }

export function analyzeAtomicClaims(input: { answer: string; prompt?: string; citationUrls?: string[]; citationStatuses?: Record<string, number | null>; citationUpdatedAt?: Record<string, string | null>; now?: number }): { claims: AtomicClaim[]; citationMetadata: CitationMetadata[]; issueCounts: Record<ClaimIssueCode, number> } {
  const allowed = [...new Set((input.citationUrls ?? []).map(cleanUrl).filter((value): value is string => !!value))].slice(0, 50);
  const metadata = splitAtomicSentences(input.answer).filter(text => /\b(?:doi|pmid|arxiv|journal|proceedings|et al\.?|19\d{2}|20\d{2})\b/i.test(text)).map(text => normalizeCitationMetadata(text, allowed.filter(url => {
    const pubmedId = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1];
    const arxivId = url.match(/arxiv\.org\/abs\/([^/?#]+)/i)?.[1];
    const doiId = url.match(/doi\.org\/(10\.[^/?#]+)/i)?.[1];
    return !!(pubmedId && text.includes(pubmedId) || arxivId && text.toLowerCase().includes(arxivId.toLowerCase()) || doiId && text.toLowerCase().includes(doiId.toLowerCase()));
  })));
  const now = input.now ?? Date.now();
  const demandsExactCount = input.prompt?.match(/\bexactly\s+(\d{1,2})\s+(?:items|points|steps|reasons|examples)\b/i);
  const claims = splitAtomicSentences(input.answer).map((text, index) => {
    const inlineUrls = [...text.matchAll(URL_PATTERN)].map(match => cleanUrl(match[0])).filter((value): value is string => !!value);
    const identifierUrls = allowed.filter(url => {
      const pubmedId = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1];
      const arxivId = url.match(/arxiv\.org\/abs\/([^/?#]+)/i)?.[1];
      const doiId = url.match(/doi\.org\/(10\.[^/?#]+)/i)?.[1];
      return !!(pubmedId && text.includes(pubmedId) || arxivId && text.toLowerCase().includes(arxivId.toLowerCase()) || doiId && text.toLowerCase().includes(doiId.toLowerCase()));
    });
    const citationUrlsForClaim = inlineUrls.length ? inlineUrls.filter(url => allowed.includes(url)) : identifierUrls.length ? identifierUrls : allowed.length === 1 ? allowed : [];
    const issues: AtomicClaim["issues"] = [];
    const hasFactualSignal = /\b(?:is|are|was|were|has|have|costs?|priced|launched|founded|increased|decreased|percent|%|\d{4})\b/i.test(text);
    if (hasFactualSignal && citationUrlsForClaim.length === 0) issues.push(issue("F2_ungrounded_claim", "This factual-looking sentence has no explicit mapped citation URL in the saved answer evidence.", "review"));
    const scholarlyCue = /\b(?:doi|pmid|arxiv|journal|proceedings|et al\.?|\d{4})\b/i.test(text);
    if (scholarlyCue) {
      const normalized = normalizeCitationMetadata(text, citationUrlsForClaim);
      if (!normalized.title || !normalized.year || !normalized.url) issues.push(issue("F3_format_violation", "Scholarly-style reference is missing one or more normalized title, year, or URL fields.", "review"));
      if (/\b(?:doi|pmid|arxiv)\b/i.test(text) && !normalized.doi && !normalized.pmid && !normalized.arxiv_id) issues.push(issue("F6_bad_citation", "Reference contains an identifier label but no parseable DOI, PMID, or arXiv identifier."));
    }
    for (const url of citationUrlsForClaim) {
      const status = input.citationStatuses?.[url];
      if (status === 404 || status === 410) issues.push(issue("F6_bad_citation", `Saved HTTP evidence confirms the cited destination returns ${status}: ${url}.`));
      const updated = input.citationUpdatedAt?.[url];
      if (updated && Number.isFinite(Date.parse(updated)) && now - Date.parse(updated) > 90 * 86_400_000) issues.push(issue("F5_stale_information", `The cited page exposes an update timestamp older than 90 days: ${updated}.`, "review"));
    }
    if (demandsExactCount && index === 0) {
      const expected = Number(demandsExactCount[1]);
      const bullets = (input.answer.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) ?? []).length;
      if (bullets && bullets !== expected) issues.push(issue("F4_instruction_deviation", `Prompt requested exactly ${expected} items; answer contains ${bullets} list items.`));
    }
    return { text, index, citationUrls: citationUrlsForClaim, issues };
  });
  const issueCounts = Object.fromEntries(CLAIM_ISSUE_CODES.map(code => [code, claims.filter(claim => claim.issues.some(item => item.code === code)).length])) as Record<ClaimIssueCode, number>;
  return { claims, citationMetadata: metadata, issueCounts };
}
