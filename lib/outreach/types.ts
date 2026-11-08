export type CitationState = "hallucinated" | "missing" | "404" | "410" | "301" | "200" | "blocked" | "timeout" | "unknown";
export type DiscoveryResult = { domain: string; companyName: string; category: string; country: string; websiteUrl: string; sourceUrl: string; excerpt: string; contact?: { email: string; name?: string; title?: string; sourceUrl: string } };
export type CitationEvidence = { url: string; state: CitationState; httpStatus: number | null; finalUrl?: string; sourceUrl: string; excerpt: string };
export type Qualification = { score: number; components: { companyFit: number; decisionMaker: number; aiPresence: number; brokenCitation: number; technicalSeo: number; verifiedContact: number; personalization: number }; eligible: boolean; reasons: string[] };
