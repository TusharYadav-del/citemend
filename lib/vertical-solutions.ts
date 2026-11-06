export const verticalSolutions = {
  agencies: {
    slug: "agencies",
    label: "SEO/GEO Agencies",
    eyebrow: "For agencies managing 5–50 clients",
    title: "Turn AI citation recovery into a repeatable client service.",
    description: "Monitor each client workspace, verify broken citations, and give teams a clear, white-label proof trail from discovery through approved recovery.",
    highlights: [
      { title: "Multi-client workspaces", description: "Keep audits, prompts, integrations, and evidence organized by each client domain." },
      { title: "White-label pitch reports", description: "Present saved evidence with agency branding and a clear before-and-after recovery story." },
      { title: "Six-stage opportunity CRM", description: "Track an opportunity from discovery through qualification, review, and a documented next step." },
      { title: "Recurring recovery automation", description: "Queue scheduled scans and recovery drafts while keeping redirect approval with a person." },
    ],
    cta: "Explore agency workspaces",
  },
  saas: {
    slug: "saas",
    label: "B2B SaaS",
    eyebrow: "For product teams with content libraries",
    title: "See how buyer-intent answers represent your product.",
    description: "Run recurring buyer-prompt checks, inspect observed citations, compare public product facts, and prioritize broken destinations using evidence your team can reproduce.",
    highlights: [
      { title: "Buyer-intent prompt monitoring", description: "Save the questions your buyers ask and compare recorded search-grounded observations over time." },
      { title: "AI citation forensics", description: "Inspect discoverability, retrieval, citation selection, freshness, and destination evidence without claiming private model reasoning." },
      { title: "Pricing and feature consistency", description: "Compare public pricing and product claims across pages, structured data, and recorded answers." },
      { title: "Hallucinated URL recovery", description: "Verify broken URLs and review a relevant live destination before proposing a human-approved redirect." },
    ],
    cta: "Run a buyer-prompt scan",
  },
  ecommerce: {
    slug: "ecommerce",
    label: "Ecommerce",
    eyebrow: "For commerce and catalog teams",
    title: "Keep product citations pointed at live, accurate pages.",
    description: "Synchronize catalog data, check product and variant destinations, and review price or availability conflicts against saved buyer-prompt evidence.",
    highlights: [
      { title: "Shopify catalog sync", description: "Import supported Shopify product data and compare it with public product-page evidence." },
      { title: "Product and variant URL checks", description: "Verify catalog destinations and surface broken variant URLs for review." },
      { title: "Price and stock mismatch signals", description: "Compare recorded answer claims with current catalog price and availability fields." },
      { title: "Bulk 301 recovery", description: "Map eligible broken product URLs to live parent destinations and export reviewed Shopify redirects." },
    ],
    cta: "Open ecommerce recovery tools",
  },
  enterprise: {
    slug: "enterprise",
    label: "Enterprise",
    eyebrow: "For security-conscious organizations",
    title: "Bring AI citation recovery into governed workflows.",
    description: "Use organization workspaces, least-privilege roles, review gates, and reproducible evidence to make recovery work suitable for enterprise operations.",
    highlights: [
      { title: "SSO and RBAC", description: "Map verified organization membership to owner, admin, editor, and viewer capabilities." },
      { title: "Immutable action audit logs", description: "Keep a server-side record of recovery approvals, deployments, and rollbacks." },
      { title: "Configurable data retention", description: "Set supported observation retention windows and workspace API rate limits." },
      { title: "API, MCP, and procurement readiness", description: "Use scoped API keys and approval-gated MCP tools alongside published security documentation." },
    ],
    cta: "Review enterprise readiness",
  },
} as const;

export type VerticalSlug = keyof typeof verticalSolutions;
export function getVerticalSolution(value: string) {
  return Object.hasOwn(verticalSolutions, value) ? verticalSolutions[value as VerticalSlug] : null;
}

export function getVerticalSolutionPageModel(value: string) {
  const solution = getVerticalSolution(value);
  if (!solution) return null;
  const ctaHref: Record<VerticalSlug, string> = {
    agencies: "/dashboard#workspaces",
    saas: "/forensic-scan",
    ecommerce: "/dashboard#ecommerce-catalog",
    enterprise: "/security-overview.md",
  };
  return { solution, ctaHref: ctaHref[solution.slug], relatedLinks: ["/integrations", "/benchmarks"] as const };
}
