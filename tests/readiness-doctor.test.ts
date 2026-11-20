import assert from "node:assert/strict";
import { test } from "node:test";
import { REQUIRED_READINESS_TABLES, runReadinessDoctor, type SchemaTableStatus } from "../lib/readiness-doctor";

const completeEnvironment: Record<string, string> = {
  DODO_PAYMENTS_ENABLED: "true",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_real-looking-key",
  CLERK_SECRET_KEY: "sk_live_real-looking-key",
  GROQ_API_KEY: "groq-real-looking-key",
  TAVILY_API_KEY: "tavily-real-looking-key",
  GEMINI_API_KEY: "gemini-real-looking-key",
  RESEND_API_KEY: "resend-real-looking-key",
  CRON_SECRET: "a-long-secret-value",
  DODO_PAYMENTS_API_KEY: "dodo-real-looking-key",
  DODO_PAYMENTS_WEBHOOK_KEY: "webhook-secret",
  DODO_PRODUCT_PILOT_ID: "pilot-product",
  DODO_PRODUCT_GROWTH_ID: "growth-product",
  DODO_PRODUCT_AGENCY_ID: "agency-product",
};

function allTables(): SchemaTableStatus[] {
  return REQUIRED_READINESS_TABLES.map((table_name) => ({ table_name, table_exists: true, rls_enabled: true, policy_count: 1 }));
}

test("readiness doctor reports a complete schema and provider configuration without exposing secrets", async () => {
  const result = await runReadinessDoctor({
    env: completeEnvironment,
    inspectDatabase: async () => ({ connected: true, tables: allTables() }),
    now: () => new Date("2026-11-06T00:00:00.000Z"),
  });
  assert.equal(result.status, "PASS", "configured Dodo Payments is the active provider");
  assert.equal(result.databaseSetupPending, false);
  assert.equal(result.checks.find((check) => check.id === "database")?.status, "PASS");
  assert.equal(result.checkedAt, "2026-11-06T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(result), /real-looking-key|long-secret-value|webhook-secret/);
});
test("readiness doctor flags missing tables and disabled RLS as pending database setup", async () => {
  const tables = allTables().map((table) => table.table_name === "audits"
    ? { ...table, rls_enabled: false }
    : table.table_name === "scheduled_reports" ? { ...table, table_exists: false } : table);
  const result = await runReadinessDoctor({ env: completeEnvironment, inspectDatabase: async () => ({ connected: true, tables }) });
  const database = result.checks.find((check) => check.id === "database");
  assert.equal(database?.status, "MISSING");
  assert.equal(result.databaseSetupPending, true);
  assert.ok(database?.details.some((detail) => detail.includes("scheduled_reports")));
  assert.ok(database?.details.some((detail) => detail.includes("audits")));
});

test("readiness doctor differentiates missing required settings from optional feature warnings", async () => {
  const result = await runReadinessDoctor({
    env: { ...completeEnvironment, GROQ_API_KEY: "", GEMINI_API_KEY: "" },
    inspectDatabase: async () => ({ connected: false, error: "Supabase is not configured." }),
  });
  assert.equal(result.status, "MISSING");
  assert.equal(result.checks.find((check) => check.id === "ai-search")?.status, "MISSING");
  assert.equal(result.checks.find((check) => check.id === "gemini")?.status, "WARN");
  assert.equal(result.checks.find((check) => check.id === "database")?.status, "MISSING");
});

test("readiness doctor requires all Dodo billing credentials and product IDs", async () => {
  const env: Record<string, string> = { ...completeEnvironment };
  delete env.DODO_PRODUCT_GROWTH_ID;
  const result = await runReadinessDoctor({ env, inspectDatabase: async () => ({ connected: true, tables: allTables() }) });
  assert.equal(result.checks.find(check => check.id === "dodo-payments")?.status, "MISSING");
});

test("readiness doctor accepts existing Dodo product ID variable names", async () => {
  const env = { ...completeEnvironment, DODO_PRODUCT_PILOT_ID: undefined, DODO_PRODUCT_GROWTH_ID: undefined, DODO_PRODUCT_AGENCY_ID: undefined,
    DODO_PAYMENTS_PILOT_ID: "pilot-product", DODO_PAYMENTS_GROWTH_ID: "growth-product", DODO_PAYMENTS_AGENCY_ID: "agency-product" };
  const report = await runReadinessDoctor({ env, inspectDatabase: async () => ({ connected: true, tables: allTables() }) });
  assert.equal(report.checks.find(check => check.id === "dodo-payments")?.status, "PASS");
});

test("readiness doctor checks all expected tables through migration 046", () => {
  assert.equal(REQUIRED_READINESS_TABLES.length, 48);
  assert.ok(REQUIRED_READINESS_TABLES.includes("ai_provenance_events"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("free_provenance_leads"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("billing_webhook_events"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("workspace_api_rate_windows"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("workspace_domains"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("workspace_operating_metrics"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("case_studies"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("design_partner_applications"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("agency_referrals"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("background_jobs"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("founder_weekly_scorecards"));
  assert.ok(REQUIRED_READINESS_TABLES.includes("support_tickets"));
});
