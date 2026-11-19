# CiteMend — 4-Year Master Architecture & Strategic Blueprint (2026–2030)

**Mission:** Make every digital commerce and AI-mediated interaction accurate, accessible, and measurable—evolving CiteMend from broken-link recovery into the global **Commerce Reliability, Citation Provenance, Source-Repair, and Claim-Verification Infrastructure Layer**.

**Core Operating Rule:** Think globally. Build progressively.

## 1. The 6-Pillar Platform Suite
- **01. CiteMend Recovery:** Defensive owned-domain dead-URL recovery (301 Shopify/Cloudflare deployment with soft-404 guardrails) + Offensive third-party broken-citation reclamation (replacing rotted `.com` links on AI-cited comparison articles, news, and Wikipedia pages).
- **02. CiteMend Intelligence:** Empirical GEO/extractability diagnostics, 90-day freshness decay alerts, stale-fact/price/inventory/policy diffing, and model-misread detection.
- **03. CiteMend AI Analytics:** Server-side AI crawler log matching (`GPTBot`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`), retrieved-vs-rendered provenance, multi-run retrieval consistency confidence intervals, and post-fix revenue attribution.
- **04. CiteMend Catalog:** Structured product feed truth, SKU/price/availability consistency, and schema verification.
- **05. CiteMend Agent Reliability:** Two-stage claim-to-source entailment engine + agentic commerce protocol readiness and checkout monitoring (OpenAI ACP, Google UCP, Amazon Rufus, Walmart Sparky).
- **06. CiteMend Enterprise:** 6-step scholarly/legal Waterfall cascade (Crossref, PubMed, OpenAlex, Retraction Watch, Pattern-3 hijacked-DOI auditor), EU AI Act Article 50 / C2PA provenance logs, Legal Pre-Filing Auditor (CA SB 574 / NY Part 161), and the CiteMend MCP Server.

## 2. Empirical Impact x Effort Fix Ranking Formula
- **Priority Tier 1 (Highest Impact / Lowest Effort):**
  1. Unblock AI search crawlers (`GPTBot`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`) in `robots.txt` / `/llms.txt` and ensure SSR (+23% total traffic / +14% human traffic retention).
  2. Repair cited `404`/`410` owned URLs via verified 301 redirects or restoration patches.
  3. Refresh stale facts and visible timestamps within a 30-day window (3.2x citation advantage; >90 days un-updated carries 3x citation-loss risk).
  4. Insert a 40–60 word self-contained **Answer Capsule** in the first 30% of the page (where 44.2% of LLM citations originate), enriched with direct credible quotations (+40.9% visibility) and concrete statistics (+30.6% visibility).
- **Priority Tier 2 (High Impact / Moderate Effort):**
  1. Add authoritative outbound citations to challenger pages ranking #4–#10 (+115.1% visibility lift) and remove keyword stuffing (-8.3%).
  2. Prune page navigation below 60 links (lifting agent first-read content delivery from 33% to 78%).
  3. Expand core comparison/reference guides with structured comparison tables (32.5% citation share; 4.3x advantage for deep guides).
  4. Pitch offensive broken-link replacements to third-party earned media and Wikipedia references (which drive 82–85% of AI citations).

## 3. The 5-Layer Hybrid Provenance & Entailment Pipeline
- **Stage 1 (Atomic Claim Decomposition):** Sentence-level FActScore claim extraction + deterministic-first metadata parser (`title`, `authors`, `year`, `venue`, `url`, `doi`, `arxiv_id`, `pmid`), falling back to fast Flash-Lite parsing only when regex/rule parsing fails.
- **Stage 2 (6-Step Waterfall Retrieval Cascade):**
  1. Live HTTP health check with retry backoff (separating 6.45% temporary errors from 66.5% permanent rot) + crawler/SSR/60-link check.
  2. Direct identifier resolution (`DOI` via Crossref, `PMID` via PubMed, `arXiv`).
  3. Crossref & Retraction Watch integrity sync (catching the 89.71% of retracted works that continue being cited).
  4. Semantic Scholar, OpenAlex, DBLP & ACL Anthology word-overlap + publication-year bonus + normalized Levenshtein title similarity cascade.
  5. Wayback Machine dated snapshot lookup for `404`/`410` commercial URLs + constrained primary-source web search fallback.
  6. Calibrated 3-Way Scoring (`EXACT >= 7.25`, `MINOR 1.25 to < 7.25`, `MAJOR < 1.25`) + Pattern-3 Reviewer Pass (triggered when a resolving DOI/URL exhibits low title similarity or `< 60%` author overlap).
- **Stage 3 (Two-Stage Claim-to-Source Entailment — `~$0.04/doc`):**
  - *Tier 1 (Fast Snippet/Abstract Gate):* Evaluates atomic claim against retrieved snippet/abstract (`SUPPORTS`, `CONTRADICTS`, `NEI` + calibrated confidence), resolving ~67% of checks without full-text token cost.
  - *Tier 2 (Deep Passage Escalation):* Triggered only on ~33% `NEI`/low-confidence claims; chunks full text into 5,000-token segments, selects top-2 passages via embeddings (`cosine > 0.5`), and outputs a stale-fact diff and justification.
