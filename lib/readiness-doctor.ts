export const REQUIRED_READINESS_TABLES = [
  "audits", "broken_links", "subscriptions", "weekly_scan_runs", "weekly_scan_jobs", "weekly_scan_digests",
  "redirect_rules", "sitemap_pages", "audit_citation_gaps", "ai_404_events", "citation_hijack_opportunities",
  "cms_connections", "rescued_ai_visits", "workspace_integrations", "pixel_intercept_quotas", "action_audit_logs",
  "ai_observation_evidence", "recovery_outcomes", "webhook_events_log", "workspace_api_keys",
  "autonomous_agent_runs", "ecommerce_catalog_items", "organization_members", "workspace_governance_policies",
  "scheduled_reports", "citation_change_events", "workspace_api_rate_windows", "workspace_operating_metrics",
  "case_studies", "design_partner_applications", "agency_referrals", "forensic_teaser_rate_windows",
  "background_jobs", "founder_weekly_scorecards", "support_tickets",
  "outreach_prospects", "outreach_evidence", "outreach_contacts", "outreach_campaigns", "outreach_emails",
  "outreach_events", "outreach_suppressions", "outreach_daily_runs", "outreach_settings",
] as const;

export type ReadinessStatus = "PASS" | "WARN" | "MISSING";
export type ReadinessCheck = { id: string; label: string; status: ReadinessStatus; summary: string; details: string[] };
export type SchemaTableStatus = { table_name: string; table_exists: boolean; rls_enabled: boolean; policy_count: number };
export type ReadinessReport = { checkedAt: string; status: ReadinessStatus; checks: ReadinessCheck[]; databaseSetupPending: boolean };

type ReadinessEnvironment = Record<string, string | undefined>;
type ReadinessInput = {
  env?: ReadinessEnvironment;
  inspectDatabase: () => Promise<{ connected: boolean; tables?: SchemaTableStatus[]; error?: string }>;
  now?: () => Date;
};

function configured(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase();
  return !["your-", "replace_with", "changeme", "example.com"].some((placeholder) => normalized.includes(placeholder));
}

function requiredCheck(id: string, label: string, names: string[], env: ReadinessEnvironment): ReadinessCheck {
  const missing = names.filter((name) => !configured(env[name]));
  return {
    id,
    label,
    status: missing.length ? "MISSING" : "PASS",
    summary: missing.length ? `${missing.length} required setting${missing.length === 1 ? "" : "s"} missing.` : "Required settings are present.",
    details: missing.length ? [`Missing: ${missing.join(", ")}`] : ["Values are configured; secret values are never returned."],
  };
}

export async function runReadinessDoctor({ env = process.env, inspectDatabase, now = () => new Date() }: ReadinessInput): Promise<ReadinessReport> {
  let database: Awaited<ReturnType<ReadinessInput["inspectDatabase"]>>;
  try {
    database = await inspectDatabase();
  } catch {
    database = { connected: false, error: "Database check could not be completed." };
  }

  let databaseCheck: ReadinessCheck;
  if (!database.connected) {
    databaseCheck = { id: "database", label: "Supabase schema and connectivity", status: "MISSING", summary: "Could not verify the live database.", details: [database.error ?? "Check the Supabase URL, server key, and connectivity."] };
  } else if (!database.tables) {
    databaseCheck = { id: "database", label: "Supabase schema and connectivity", status: "WARN", summary: "Database responds, but the readiness schema check is not installed.", details: ["Apply the latest tenant isolation migration to verify table presence and RLS policies."] };
  } else {
    const tableMap = new Map(database.tables.map((table) => [table.table_name, table]));
    const missingTables = REQUIRED_READINESS_TABLES.filter((name) => !tableMap.get(name)?.table_exists);
    const rlsDisabled = REQUIRED_READINESS_TABLES.filter((name) => tableMap.get(name)?.table_exists && !tableMap.get(name)?.rls_enabled);
    const defaultDenyTables = REQUIRED_READINESS_TABLES.filter((name) => tableMap.get(name)?.table_exists && tableMap.get(name)!.policy_count === 0);
    const details = [
      `${REQUIRED_READINESS_TABLES.length - missingTables.length}/${REQUIRED_READINESS_TABLES.length} required tables exist.`,
      `${REQUIRED_READINESS_TABLES.length - rlsDisabled.length}/${REQUIRED_READINESS_TABLES.length} existing required tables have RLS enabled.`,
      ...(missingTables.length ? [`Missing tables: ${missingTables.join(", ")}`] : []),
      ...(rlsDisabled.length ? [`RLS disabled: ${rlsDisabled.join(", ")}`] : []),
      ...(defaultDenyTables.length ? [`${defaultDenyTables.length} RLS-enabled tables have no user policies and remain default-deny.`] : []),
    ];
    const status: ReadinessStatus = missingTables.length || rlsDisabled.length ? "MISSING" : "PASS";
    databaseCheck = { id: "database", label: "Supabase schema and connectivity", status, summary: status === "PASS" ? "All required tables exist with RLS enabled." : "Database setup is incomplete.", details };
  }

  const lemonSqueezyConfigured = ["LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_STORE_ID", "LEMON_SQUEEZY_PRODUCT_ID", "LEMON_SQUEEZY_VARIANT_ID", "LEMON_SQUEEZY_WEBHOOK_SECRET"].every((name) => configured(env[name]));
  const dodoCredentialsPresent = configured(env.DODO_PAYMENTS_API_KEY) || configured(env.DODO_PAYMENTS_WEBHOOK_SECRET);
  const checks: ReadinessCheck[] = [
    databaseCheck,
    requiredCheck("clerk", "Clerk authentication", ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"], env),
    requiredCheck("ai-search", "AI and search providers", ["GROQ_API_KEY", "TAVILY_API_KEY"], env),
    {
      id: "gemini", label: "Gemini features", status: configured(env.GEMINI_API_KEY) ? "PASS" : "WARN",
      summary: configured(env.GEMINI_API_KEY) ? "Gemini key is configured." : "Gemini key is missing; Gemini-backed features may be unavailable.",
      details: configured(env.GEMINI_API_KEY) ? ["Secret value is not returned."] : ["Missing: GEMINI_API_KEY"],
    },
    requiredCheck("email-cron", "Email and cron", ["RESEND_API_KEY", "CRON_SECRET"], env),
    requiredCheck("lemon-squeezy", "Lemon Squeezy billing", ["LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_STORE_ID", "LEMON_SQUEEZY_PRODUCT_ID", "LEMON_SQUEEZY_VARIANT_ID", "LEMON_SQUEEZY_WEBHOOK_SECRET"], env),
    {
      id: "dodo-payments", label: "Dodo Payments", status: dodoCredentialsPresent ? "WARN" : lemonSqueezyConfigured ? "PASS" : "WARN",
      summary: dodoCredentialsPresent ? "Dodo credentials are present, but this application does not integrate Dodo Payments." : lemonSqueezyConfigured ? "Not required; Lemon Squeezy is configured as the active billing provider." : "Dodo Payments is not integrated; configure the supported Lemon Squeezy provider instead.",
      details: ["The current checkout and webhook implementation supports Lemon Squeezy."],
    },
  ];
  const status: ReadinessStatus = checks.some((check) => check.status === "MISSING") ? "MISSING" : checks.some((check) => check.status === "WARN") ? "WARN" : "PASS";
  return { checkedAt: now().toISOString(), status, checks, databaseSetupPending: databaseCheck.status !== "PASS" };
}
