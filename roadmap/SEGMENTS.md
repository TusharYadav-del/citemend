# CiteMend — Segmented Build Queue (2026–2030)

Status Legend: `[DONE]` | `[NEXT]` | `[PENDING]` | `[LOCKED]`

## STAGE 1 (Completed Foundation) — Core Recovery, Guardrails & Billing
- **[S1.1] [DONE]** Public SEO Indexability (`robots.ts`, `sitemap.ts`, SSR metadata), 6-Pillar Homepage Positioning & Outbound Email Hard Lock (`OUTBOUND_EMAILS_ENABLED=false`).
- **[S1.2] [DONE]** URL-Agnostic Recovery Schema (Migration 038), High-Signal 404 Normalization & Deterministic Soft-404 / Loop Guardrail Engine.
- **[S1.3] [DONE]** 1-Click Shopify GraphQL (`urlRedirectCreate`) & Cloudflare Bulk Redirect Export, Post-Deployment HTTP Verifier, and 4-Metric Retention Dashboard UI.
- **[S1.4] [DONE]** Dodo Payments Billing Engine (`dodopayments` SDK, $149 30-Day Pilot + $99 Growth + $249 Agency checkout, idempotent Standard Webhooks, customer portal, full Lemon Squeezy removal).

*(Note to Codex: If any remaining file or test in S1.4 is still unfinished in the repo, verify and finish it automatically during S2.1 startup.)*

## STAGE 2 (Completed; validation gate pending) — Two-Sided Provenance, GEO Diagnostics & AI Analytics
- **[S2.1] [DONE]** Two-Sided Broken-Citation Reclamation (Defensive + Offensive) & Link-Health Waterfall v1:
  - Separate page-level broken-link counts from unique failed destination URLs across schemas, APIs, and UI cards.
  - Upgrade HTTP link-health checking with retry classification to distinguish temporary errors (`timeout`/`5xx`/rate-limit) from permanent link rot (`404`/`410`).
  - Integrate free Internet Archive (Wayback Machine Availability API) snapshot lookup for `404`/`410` commercial URLs so users see historical page context when approving a redirect or replacement.
  - Add **Offensive Broken-Citation Reclamation**: scan third-party pages cited by AI engines (comparison articles, news, Wikipedia references), detect dead outbound `.com` links, and map them to verified live pages on the customer's domain with a pre-drafted replacement snippet.
- **[S2.2] [DONE]** Empirical GEO, Freshness Decay & Agent-Extractability Auditor (Impact x Effort Scoring Engine):
  - Build the deterministic page extractability scanner that checks `robots.txt` and `/llms.txt` permissions for `GPTBot`, `PerplexityBot`, `ClaudeBot`, and `Google-Extended`, verifies SSR html delivery, and counts navigation links (flagging pages with `>= 60` links where agent extraction drops from 78% to 33%).
  - Audit the first 30% of page content for a 40–60 word self-contained **Answer Capsule**, measure quotation density (+40.9% driver) and statistic density (+30.6% driver), detect keyword stuffing (-8.3%), and flag pages un-updated for `> 90` days (3x citation-loss risk).
  - Rank all discovered fixes using the calibrated **Priority Tier 1 & Tier 2 Impact x Effort Formula** and display actionable remediation cards in the dashboard.
- **[S2.3] [DONE]** Stage-1 Atomic Claim Decomposition, Stale-Fact Diff Panel & Catalog Truth Monitor (`F1`–`F6` Taxonomy):
  - Implement FActScore-style sentence-level atomic claim decomposition and deterministic-first citation metadata normalization (`title`, `authors`, `year`, `venue`, `url`, `doi`, `arxiv_id`, `pmid`).
  - Classify claim-level issues using the `F1`–`F6` taxonomy (`F1_fabricated_fact`, `F2_ungrounded_claim`, `F3_format_violation`, `F4_instruction_deviation`, `F5_stale_information`, `F6_bad_citation`).
  - Build the **Stale-Fact & Misattribution Diff Panel** categorizing discrepancies into: (1) Stale Owned Pages (`>90` days or Shopify price/inventory/policy mismatch), (2) Stale Third-Party Sources, and (3) Model Misreads (where the cited page is accurate or HTTP 200 OK, but the LLM misattributed or distorted the claim).
- **[S2.4] [DONE]** Server-Side AI Crawler Log Matcher, Retrieved-vs-Rendered Provenance & Multi-Run Consistency Index:
  - Build a lightweight Next.js/Cloudflare/Shopify-compatible edge log ingestion endpoint that matches real `GPTBot`, `PerplexityBot`, `ClaudeBot`, and `Google-Extended` crawler hits and AI referral headers (`chatgpt.com`, `perplexity.ai`, `gemini.google.com`, `claude.ai`) to cited URLs and downstream Shopify orders (without trusting spoofable user-agents alone).
  - Separate internal RAG-retrieved sources from explicitly rendered user links, and separate **Domain Influence** (third-party brand mentions) from **Citation Authority** (direct domain links).
  - Compute the **Retrieval Consistency & Confidence Index** across repeated prompt/URL checks so users see statistical stability rather than noisy single-run scores.
- **[S2.5] [DONE]** Agency Multi-Workspace Hub, White-Label 4-Metric Reports & Free Provenance Auditor Lead Magnet:
  - Build the multi-client Agency Workspace Switcher and 1-click **White-Label Monthly ROI & Provenance Report** (HTML/print-PDF ready) displaying the 4-Metric Retention Gate + Retrieved-vs-Rendered breakdown.
  - Ship a rate-limited, $0-API-cost **"Free CiteMend Provenance & Broken-Citation Auditor"** widget on the public homepage (checking live HTTP status, Wayback snapshot, crawler access, 60-link bloat, and metadata validity) to capture inbound B2B leads organically.
  - Wire the internal Draft-Locked **"1-Verified-Example" Outreach Workbench** (strictly gated behind `OUTBOUND_EMAILS_ENABLED === "true"`).

---
### VALIDATION GATE: Stage 2 -> Stage 3
*There is no unlocked `[NEXT]` build segment. Unlock Stage 3 (`unlock stage 3`) once Stage 2 passes full end-to-end verification and initial customer pilots.*
---

## STAGE 3 (2028–2029) — Deep Entailment, Catalog Feeds & Agentic Commerce Reliability [LOCKED]
- **[S3.1] [LOCKED]** Two-Stage Selective Evidence Escalation Pipeline (DeepSciVerify pattern: Tier-1 fast abstract/snippet entailment verifier predicting `SUPPORTS`, `CONTRADICTS`, or `NEI` to resolve ~67% of checks cheaply + Tier-2 5,000-token chunk embedding retrieval for the remaining ~33% `NEI` claims).
- **[S3.2] [LOCKED]** Structured Product Feed Truth & Agentic Commerce Protocol Adapters (OpenAI ACP & Google UCP schema validation, SKU/price/stock sync diagnostics, and feed drift alerts).
- **[S3.3] [LOCKED]** Autonomous Shopping Agent & Checkout Reliability Monitor (audit product representation and transaction consistency across ChatGPT Instant Checkout, Google AI Mode, Amazon Rufus, and Walmart Sparky + automated closed-loop redirect QA cron).
- **[S3.4] [LOCKED]** Full Stage 1–3 End-to-End QA Stress Test & Production Performance Hardening.

## STAGE 4 (2029–2030) — Enterprise Compliance, Scholarly/Legal Waterfall & MCP Protocol [LOCKED]
- **[S4.1] [LOCKED]** 6-Step Scholarly & Legal Waterfall Cascade (`DOI` via Crossref, `PMID` via PubMed, `arXiv`, Semantic Scholar, OpenAlex, and Retraction Watch integrity sync) + CITECHECK calibrated 3-way scoring (`EXACT >= 7.25`, `MINOR 1.25 to < 7.25`, `MAJOR < 1.25`) and Pattern-3 Reviewer Pass for hijacked DOIs.
- **[S4.2] [LOCKED]** Legal Pre-Filing Authority Auditor & EU AI Act Article 50 Provenance Ledger (compliance verification certificates for California SB 574, New York 22 NYCRR Part 161, and 9th Cir. Rule 32-1 + C2PA content credential hooks and timestamped human editorial responsibility logs).
- **[S4.3] [LOCKED]** CiteMend MCP Server (Model Context Protocol) & `/llms.txt` Runtime Verification Standard (allowing external AI agents and enterprise copilots to verify citations, URLs, and catalog claims at runtime before generating answers).
- **[S4.4] [LOCKED]** Enterprise Governance, Multi-Platform Connectors (WooCommerce, BigCommerce, Headless), Optional Self-Hosted Local NLI Node (`FactCG-DeBERTa-v3-Large` / `Granite Guardian 3.3`), RBAC/SSO & Usage Metering.
