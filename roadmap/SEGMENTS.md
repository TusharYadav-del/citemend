# CiteMend — Segmented Build Queue (2026–2030)

Status Legend: `[DONE]` | `[NEXT]` | `[PENDING]` | `[LOCKED]`
*(Codex: Inspect `PLAN.md` and the current codebase during setup and accurately set S1.1–S1.4 to `[DONE]` or `[NEXT]` based on what is already implemented!)*

## YEAR 1 (2026–2027) — Product 01: CiteMend Recovery (Active)
- **[S1.1] [DONE]** Public SEO Indexability (`robots.ts`, `sitemap.ts`, SSR metadata), 6-Pillar Homepage Positioning & Outbound Email Hard Lock (`OUTBOUND_EMAILS_ENABLED=false`).
- **[S1.2] [DONE]** URL-Agnostic Recovery Schema (Migration 038), High-Signal 404 Normalization & Deterministic Soft-404 / Loop Guardrail Engine.
- **[S1.3] [DONE]** 1-Click Shopify GraphQL (`urlRedirectCreate`) & Cloudflare Bulk Redirect Export, Post-Deployment HTTP Verifier, and 4-Metric Retention Dashboard UI.
- **[S1.4] [DONE]** Dodo Payments Billing Migration (`dodopayments` SDK, $149 Pilot + $99 Growth + $249 Agency checkout, idempotent Standard Webhooks, customer portal, active Lemon Squeezy code removed; legacy records retained).
- **[S1.5] [DONE]** Pre-Launch End-to-End QA Stress Test & Production Hardening (recovery scan-to-approval-to-deployment verification smoke test, Dodo webhook signature/idempotency integration test, controlled auth-unavailable responses, and isolated Turbopack build verification).
- **[S1.6] [DONE]** Continuous High-Signal 404 & Referrer Event Ingestion API + Automated Redirect QA Cron (quota-limited, normalized event intake and daily DNS-pinned checks for deployed redirects, broken targets, chains, and loops; user-agent strings are never proof of AI traffic).
- **[S1.7] [DONE]** Agency Multi-Workspace Switcher & White-Label Monthly ROI Report Export (client-domain selection and HTML/print-ready four-metric calendar-month report).
- **[S1.8] [NEXT]** Self-Serve Diagnostic Preview & Manual "1-Verified-Example" Outreach Workbench (draft-first founder approval UI, domain deliverability checklist, suppression/opt-out ledger, gated behind `OUTBOUND_EMAILS_ENABLED`).

---
### VALIDATION GATE: Year 1 -> Year 2
*Do not unlock Year 2 until Product 01 has validated paying customers and recurring retention.*
---

## YEAR 2 (2027–2028) — Product 02 (Intelligence) & Product 03 (AI Analytics) [LOCKED]
- **[S2.1] [LOCKED]** AI Assistant Referral Attribution & Post-Fix Revenue Tracking (correlate recovered URLs with landing sessions and Shopify order events).
- **[S2.2] [LOCKED]** Outdated Price & Inventory Discrepancy Detector (compare live Shopify catalog truth against AI-cited product snippets and flag mismatches).
- **[S2.3] [LOCKED]** Policy, Shipping, Returns & Help-Center Dead-End Monitor (detect stale trust/policy pages cited by assistants).
- **[S2.4] [LOCKED]** Recurring AI Citation Watchlist & Historical Evidence Snapshots (scheduled prompt/URL rechecks with diff alerts).

## YEAR 3 (2028–2029) — Product 04 (Catalog) & Product 05 (Agent Reliability) [LOCKED]
- **[S3.1] [LOCKED]** Structured Product Feed & SKU Truth Verification Engine (schema, availability, variant pricing, and feed consistency checks).
- **[S3.2] [LOCKED]** Agentic Commerce Protocol Adapters (OpenAI ACP & Google UCP readiness diagnostics and endpoint validation).
- **[S3.3] [LOCKED]** Agent Checkout Reliability Monitor (detect checkout session drops, stock race conditions, and payment/policy rejections).
- **[S3.4] [LOCKED]** Automated Catalog-to-Agent Remediation Playbooks (approval-gated feed and metadata fixes).

## YEAR 4 (2029–2030) — Product 06 (CiteMend Enterprise) [LOCKED]
- **[S4.1] [LOCKED]** Public Developer API (versioned REST/GraphQL endpoints, API key management, webhooks, and rate limiting).
- **[S4.2] [LOCKED]** Multi-Platform Commerce Adapters (WooCommerce, BigCommerce, and custom headless storefront connectors).
- **[S4.3] [LOCKED]** Enterprise Governance (RBAC, SSO/SAML, immutable audit logs, and multi-region store management).
- **[S4.4] [LOCKED]** High-Volume Metering, Usage Billing & Enterprise SLA Telemetry.
