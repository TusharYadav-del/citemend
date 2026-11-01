# Day 26 launch kit — Citemend

Prepared copy and artwork for a Product Hunt draft, an X thread, a LinkedIn post, and a Show HN submission. These are drafts, not published posts.

## Product Hunt draft fields

Product URL: https://citemend.vercel.app/

Name: Citemend

Tagline: Find broken AI citations and prepare verified 301 fixes

Description (keep under 260 characters):

> Citemend surfaces links to your domain in a search-backed AI audit, checks which ones actually return 404, and suggests live replacement pages. Share a public report and export 301 rules. Try a free read-only site preview without an account.

Suggested topics to choose from the available Product Hunt list: Artificial Intelligence, SEO, and Marketing.

Pricing: Free plan plus paid Pro ($39/month). Check the actual live checkout before selecting this in the draft.

Thumbnail: [thumbnail-240.png](launch-assets/thumbnail-240.png) (240 × 240).

Gallery, in order:

1. [preview-result.png](launch-assets/preview-result.png) (1270 × 760): a real public `example.com` homepage and default-sitemap preview. This is **not** an AI citation audit.
2. [workflow-1270x760.png](launch-assets/workflow-1270x760.png) (1270 × 760): the reviewable citation-to-301 workflow. Publishing to live traffic requires a connected Cloudflare route.

Optional context image: [homepage-desktop.png](launch-assets/homepage-desktop.png). It is a real public homepage screenshot at 1440 × 900, so resize or recapture before using it as a standard gallery image.

Maker comment draft:

> Hi Product Hunt — I'm a first-year CS student at BITS Pilani. I started Citemend with no manual coding experience, using Cursor and Gemini 2.5 Flash while prototyping. The current citation audit uses Groq with Tavily search context.
>
> A buyer may find your brand in an AI answer and still land on a dead page. Citemend takes a buyer question and domain, surfaces candidate citation URLs, checks their HTTP status, and suggests a live same-domain replacement for confirmed 404s. You can share the audit and export 301 rules. Pro users can publish a reviewed rule; it affects traffic only after a Cloudflare route is connected to that domain.
>
> The public preview checks homepage and default sitemap availability only. I would love feedback on whether the evidence in a redirect suggestion is enough for you to trust and apply it. What would you want to see before approving a 301?

## X launch thread — five posts

**1/5** G2 found that 51% of surveyed B2B software buyers start research with an AI chatbot more often than Google. A cited link can still send a buyer to a 404. That broken handoff is what I set out to fix. Source: https://learn.g2.com/g2-2026-ai-search-insight-report

**2/5** I built Citemend. Give it a buyer question and your domain; its Groq + Tavily search-backed audit surfaces candidate URLs and checks their real HTTP status. A timeout is not labeled a 404.

**3/5** For a confirmed 404, Citemend suggests a live page on the same domain. Review the evidence, share an audit report, or copy 301 rules. Pro can publish a reviewed rule; live traffic routing requires a connected Cloudflare zone.

**4/5** I'm a first-year CS student at BITS Pilani. I started without manual coding experience, prototyped with Cursor and Gemini 2.5 Flash, then moved the live audit to Groq + Tavily after provider errors. A broken link can undo a good recommendation.

**5/5** Try the free, no-sign-in site preview: https://citemend.vercel.app/ It checks homepage and sitemap availability; the full citation audit is separate. I would value feedback on what would make a 301 suggestion trustworthy enough to use.

## LinkedIn draft

G2 reports that 51% of surveyed B2B software buyers start their software research with an AI chatbot more often than Google. That does not help a brand if the cited page returns 404. [G2 source](https://learn.g2.com/g2-2026-ai-search-insight-report)

I built Citemend to make that failure visible. A search-backed audit finds candidate links to your domain, checks the actual HTTP response, and suggests a live page for a confirmed 404. You can review the evidence, share a report, and export a 301 rule. Live edge routing requires a connected Cloudflare route and your approval.

I'm a first-year CS student at BITS Pilani. I started with no manual coding experience and used Cursor and Gemini 2.5 Flash during prototyping; today's audit pipeline uses Groq and Tavily.

The public site preview is available now at https://citemend.vercel.app/. It checks homepage and sitemap availability, not AI citations. If you manage redirects, what proof would you want before publishing one suggested by an audit?

## Hacker News draft

Title: Show HN: Citemend – check AI-cited URLs for 404s and prepare 301 fixes

URL: https://citemend.vercel.app/

Text:

> I'm a first-year CS student at BITS Pilani. I started this project without manual coding experience, using Cursor and Gemini 2.5 Flash for early prototypes. The active pipeline now uses Groq with Tavily search context; it does not query ChatGPT or Perplexity directly.
>
> The problem: G2 reports that 51% of surveyed B2B software buyers start research with an AI chatbot more often than Google ([source](https://learn.g2.com/g2-2026-ai-search-insight-report)). Even a good AI answer can send someone to an old URL that now returns 404.
>
> Citemend accepts a buyer question and a domain, finds candidate citation URLs, checks those URLs over HTTP, and suggests a live same-domain destination for confirmed 404s. Unreachable or uncertain checks are not counted as confirmed 404s. Reports have public share links; the dashboard can export .htaccess, Vercel, or Shopify 301 rules. The free public preview only checks homepage and default sitemap status.
>
> Pro users can publish an approved redirect rule to Supabase. The Cloudflare Worker can serve it once a route is attached to the domain; no customer zone is connected yet, so publishing alone does not redirect public traffic. Weekly scan and email code is built, but production scheduling and sender verification are still pending.
>
> I'd welcome technical feedback on false-positive controls, same-domain redirect safety, and what evidence a site owner would need before approving a 301.

## Submission and accuracy notes

- Product Hunt's old `/upcoming` URL currently returns 404. Its current flow is **Submit → New Product → Create Draft** from a personal account. Keep the draft unpublished until the production sign-in path works. The Product Hunt account step was not completed from this workspace.
- Do not describe the free site preview as an AI citation audit. The full audit requires Clerk sign-in, and Vercel still has development Clerk keys.
- Do not claim direct ChatGPT/Perplexity monitoring. The active probe uses Groq and Tavily. The older Gemini path is not the active audit provider.
- Do not promise instant live redirects for every customer. The Worker has no customer zone route attached. Weekly scheduling, a verified Resend sender, and production billing setup remain open.
- The 51% wording must retain **B2B software buyers** and **more often than Google**. It comes from [G2's 2026 AI Search Insight Report](https://learn.g2.com/g2-2026-ai-search-insight-report), based on its buyer survey.
- Product Hunt's [current launch guide](https://help.producthunt.com/en/articles/17350772-launch-guide) describes a draft, a short tagline and description, gallery visuals, and a maker comment. Its [preparation guide](https://www.producthunt.com/launch/preparing-for-launch) recommends a 240 × 240 square thumbnail and 1270 × 760 gallery images.
