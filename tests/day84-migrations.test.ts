import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import ts from "typescript";

test("daily Vercel jobs and the every-minute Supabase worker use protected cron endpoints", async () => {
  const migration = await readFile(new URL("../supabase/migrations/026_cron_retention_and_reports.sql", import.meta.url), "utf8");
  assert.match(migration, /name = 'app_base_url'/);
  assert.match(migration, /name = 'cron_secret'/);
  assert.match(migration, /'citemend-data-retention',[\s\S]*?'0 2 \* \* \*'[\s\S]*?\/api\/cron\/data-retention/);
  assert.match(migration, /'citemend-scheduled-reports',[\s\S]*?'0 4 \* \* \*'[\s\S]*?\/api\/cron\/scheduled-reports/);
  const workerMigration = await readFile(new URL("../supabase/migrations/033_background_worker_schedule.sql", import.meta.url), "utf8");
  assert.match(workerMigration, /name = 'app_base_url'/);
  assert.match(workerMigration, /name = 'cron_secret'/);
  assert.match(workerMigration, /'citemend-background-jobs',[\s\S]*?'\* \* \* \* \*'[\s\S]*?\/api\/cron\/background-jobs/);
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
  assert.deepEqual(vercel.crons, [
    { path: "/api/cron/data-retention", schedule: "0 2 * * *" },
    { path: "/api/cron/scheduled-reports", schedule: "0 4 * * *" },
    { path: "/api/cron/outreach/daily", schedule: "0 9 * * *" },
  ]);
  const outreachSetup = await readFile(new URL("../supabase/setup/outreach_cron.sql", import.meta.url), "utf8");
  assert.match(outreachSetup, /citemend-outreach-daily/);
  assert.match(outreachSetup, /\/api\/cron\/outreach\/daily/);
});

test("migrations 001 through 036 apply in order and expose the columns used by the application", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec("create schema auth; create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$; grant usage on schema auth to authenticated, service_role; grant execute on function auth.jwt() to authenticated, service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const files = (await readdir(directory)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort();
    assert.deepEqual(files.map(name => name.slice(0, 3)), Array.from({ length: 36 }, (_, index) => String(index + 1).padStart(3, "0")));
    for (const file of files) await db.exec(await readFile(new URL(file, directory), "utf8"));
    const expected: Record<string, string[]> = {
      audits: ["id", "user_id", "domain", "buyer_prompt", "status", "created_at", "completed_at", "competitor_domains", "ground_truth_pricing", "indexnow_key", "share_of_model_score", "engine_matrix_json", "agency_brand_name", "agency_logo_url", "agency_primary_color", "agency_cta_url", "agency_cta_text", "llms_txt_content", "webhook_url", "sitemap_url_count"],
      broken_links: ["id", "audit_id", "cited_url", "http_status", "suggested_redirect", "url_state", "approval_status", "approved_by", "approved_at", "previous_destination_url", "deployed_at", "rolled_back_at", "match_evidence_reason", "match_confidence", "created_at"],
      subscriptions: ["id", "user_id", "store_id", "product_id", "variant_id", "status", "plan", "plan_name", "test_mode", "lemonsqueezy_customer_id", "lemonsqueezy_subscription_id", "lemonsqueezy_order_id", "customer_portal_url", "update_payment_method_url", "trial_ends_at", "current_period_end", "ends_at", "cancelled", "provider_updated_at"],
      billing_webhook_events: ["id", "event_hash", "event_name", "payload", "processed_at"],
      weekly_scan_runs: ["id", "week_start", "status", "lease_token", "digests_prepared_at"],
      weekly_scan_jobs: ["id", "run_id", "user_id", "domain", "buyer_prompt", "status", "attempts", "lease_token", "audit_id"],
      weekly_scan_digests: ["id", "run_id", "user_id", "status", "lease_token", "provider_message_id"],
      redirect_rules: ["id", "user_id", "source_link_id", "source_host", "source_path", "destination", "active", "domain", "target_url", "confidence", "is_active", "hits_recovered", "synced_to_cms", "shopify_redirect_id"],
      sitemap_pages: ["id", "domain", "url", "page_title", "embedding", "embedding_model", "updated_at"],
      audit_citation_gaps: ["audit_id", "user_id", "domain", "buyer_prompt", "provider", "competitor_urls"],
      ai_404_events: ["id", "domain", "broken_path", "ai_referrer", "redirected_to", "user_agent", "created_at"],
      citation_hijack_opportunities: ["id", "audit_id", "domain", "opportunity_type", "target_url", "dead_competitor_url", "matched_user_live_url", "verification_status", "lifecycle_stage", "relevance_score", "buyer_intent_score", "citation_evidence_score", "replacement_quality_score", "composite_priority_score", "stage_history_json"],
      action_audit_logs: ["id", "workspace_domain", "actor_user_id", "action_type", "target_url", "previous_state_json", "new_state_json", "safety_check_passed", "created_at"],
      cms_connections: ["id", "user_id", "domain", "platform", "shop_subdomain", "access_token"],
      rescued_ai_visits: ["id", "user_id", "domain", "broken_path", "rescued_target_url", "ai_referrer", "similarity_score", "latency_ms", "created_at"],
      workspace_integrations: ["id", "user_id", "domain", "slack_webhook_url", "discord_webhook_url", "shopify_store_domain", "shopify_admin_token", "agency_brand_name", "agency_logo_url", "agency_primary_color", "agency_cta_url", "agency_cta_text"],
      pixel_intercept_quotas: ["domain", "window_started_at", "request_count"],
      ai_observation_evidence: ["id", "audit_id", "domain", "prompt_query", "prompt_version", "provider", "model_name", "search_method", "locale", "raw_answer", "extracted_urls_json", "url_status_json", "sample_size", "observation_confidence", "job_status", "retry_count", "error_message", "observed_at"],
      recovery_outcomes: ["id", "audit_id", "domain", "broken_link_id", "canonical_destination_url", "technical_deployment_verified_at", "ai_citation_observed_at", "evidence_id", "created_at"],
      webhook_events_log: ["id", "event_id", "provider", "event_type", "delivery_status", "retry_count", "last_error", "received_at", "completed_at"],
      workspace_api_keys: ["id", "user_id", "workspace_domain", "key_hash", "key_prefix", "permissions_json", "rate_limit_per_minute", "last_used_at", "created_at", "revoked_at"],
      autonomous_agent_runs: ["id", "user_id", "workspace_domain", "audit_id", "opportunity_id", "broken_link_id", "action_type", "risk_level", "current_step", "run_status", "human_approved_by", "human_approved_at", "evidence_json", "recommendation_json", "result_json", "stage_history_json", "rollback_snapshot_json", "rollback_completed_at", "error_message", "created_at", "updated_at"],
      ecommerce_catalog_items: ["id", "user_id", "workspace_domain", "platform", "external_item_id", "canonical_url", "product_json", "synced_at"],
      organization_members: ["id", "organization_id", "owner_user_id", "member_user_id", "role", "created_at"],
      workspace_governance_policies: ["id", "user_id", "workspace_domain", "monthly_scan_quota", "scans_used_this_month", "usage_month", "entity_truth_baseline_json", "allow_benchmark_aggregation", "benchmark_category", "created_at", "updated_at"],
      scheduled_reports: ["id", "user_id", "workspace_domain", "report_type", "schedule_at", "recurrence_interval", "status", "payload_json", "created_at", "updated_at"],
      citation_change_events: ["id", "user_id", "workspace_domain", "audit_id", "previous_observation_id", "current_observation_id", "prompt_query", "event_type", "source_url", "replacement_url", "new_replacement_url", "replaced_by_competitor", "evidence_json", "detected_at"],
      workspace_operating_metrics: ["user_id", "workspace_domain", "workspace_created_at", "baseline_method", "created_at"],
      workspace_api_rate_windows: ["key_id", "window_started_at", "request_count"],
      case_studies: ["id", "slug", "user_id", "workspace_domain", "audit_id", "anonymized", "is_public", "study_json", "created_at"],
      design_partner_applications: ["id", "contact_name", "contact_email", "company_name", "domain", "segment", "client_or_catalog_size", "buyer_prompt", "primary_pain_point", "teaser_status", "teaser_json", "status", "created_at"],
      agency_referrals: ["id", "partner_application_id", "referrer_user_id", "referrer_workspace_domain", "referral_code", "referred_email", "status", "visit_count", "last_visited_at", "referred_workspace_domain", "referred_workspace_user_id", "converted_at", "created_at"],
      forensic_teaser_rate_windows: ["key_id", "window_started_at", "request_count"],
      background_jobs: ["id", "user_id", "workspace_domain", "job_type", "job_key", "status", "progress_percent", "current_step_label", "payload_json", "result_json", "attempt_count", "max_attempts", "continuation_pending", "next_retry_at", "lease_token", "lease_expires_at", "error_message", "created_at", "updated_at", "completed_at"],
      founder_weekly_scorecards: ["founder_user_id", "week_start", "scorecard_json", "updated_at"],
      support_tickets: ["id", "workspace_domain", "user_id", "user_email", "category", "priority", "subject", "message", "diagnostic_context_json", "status", "created_at"],
      outreach_prospects: ["id", "domain", "company_name", "qualification_score", "status", "research_json"],
      outreach_evidence: ["id", "prospect_id", "evidence_type", "observed_state", "http_status"],
      outreach_contacts: ["id", "prospect_id", "email", "email_status", "source_url"],
      outreach_campaigns: ["id", "name", "status", "daily_target"],
      outreach_emails: ["id", "prospect_id", "recipient", "factuality_report", "status"],
      outreach_events: ["id", "email_id", "prospect_id", "event_type", "provider_event_id"],
      outreach_suppressions: ["id", "email", "reason", "source"],
      outreach_daily_runs: ["id", "run_date", "status", "sends_reserved", "telemetry"],
      outreach_settings: ["id", "outreach_enabled", "outreach_enabled_override", "kill_switch", "daily_target", "daily_send_limit", "min_qualification_score"],
    };
    const result = await db.query<{ table_name: string; column_name: string; is_nullable: string }>("select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public'");
    for (const [table, columns] of Object.entries(expected)) {
      const actual = new Set(result.rows.filter(row => row.table_name === table).map(row => row.column_name));
      for (const column of columns) assert.ok(actual.has(column), `${table}.${column} is missing`);
    }
    const rlsTables = await db.query<{ table_name: string; rls_enabled: boolean }>("select c.relname as table_name,c.relrowsecurity as rls_enabled from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')");
    for (const table of Object.keys(expected)) assert.equal(rlsTables.rows.find((row) => row.table_name === table)?.rls_enabled, true, `${table} must have RLS enabled`);
    const outreachDefaults = (await db.query<{ outreach_enabled:boolean; outreach_enabled_override:boolean|null; daily_target:number; daily_send_limit:number; min_qualification_score:number }>("select outreach_enabled,outreach_enabled_override,daily_target,daily_send_limit,min_qualification_score from public.outreach_settings where id=1")).rows[0];
    assert.deepEqual(outreachDefaults,{outreach_enabled:false,outreach_enabled_override:null,daily_target:20,daily_send_limit:15,min_qualification_score:75});
    assert.deepEqual((await db.query<{ table_name: string }>("select table_name from public.citemend_readiness_schema_status() order by table_name")).rows.length, 45);
    const firstOutreachRun = (await db.query<{ claimed: boolean; run_id: string }>("select * from public.outreach_begin_daily_run('2026-11-08')")).rows[0];
    assert.equal(firstOutreachRun.claimed, true);
    const duplicateOutreachRun = (await db.query<{ claimed: boolean; run_id: string }>("select * from public.outreach_begin_daily_run('2026-11-08')")).rows[0];
    assert.equal(duplicateOutreachRun.claimed, false);
    assert.equal((await db.query<{ allowed: boolean }>("select public.outreach_reserve_daily_send('2026-11-08',1) allowed")).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>("select public.outreach_reserve_daily_send('2026-11-08',1) allowed")).rows[0].allowed, false);
    const firstJob = (await db.query<{ id: string }>("select id from public.enqueue_background_job('queue_user','queue.example','ecommerce_sync','catalog-run-1','{\"source\":\"json\"}'::jsonb)")).rows[0].id;
    const duplicateJob = (await db.query<{ id: string }>("select id from public.enqueue_background_job('queue_user','queue.example','ecommerce_sync','catalog-run-1','{\"source\":\"json\"}'::jsonb)")).rows[0].id;
    assert.equal(duplicateJob, firstJob, "idempotent enqueue returns the same job row");
    let claimed = (await db.query<{ id: string; attempt_count: number; lease_token: string }>("select id,attempt_count,lease_token from public.claim_background_job(60)")).rows[0];
    assert.equal(claimed.id, firstJob);
    assert.equal(claimed.attempt_count, 1);
    const siblingJob = (await db.query<{ id: string }>("select id from public.enqueue_background_job('queue_user','queue.example','audit_enrichment','sibling-job','{}'::jsonb)")).rows[0].id;
    assert.equal((await db.query<{ reported: boolean }>(`select public.report_background_job_progress('${firstJob}','${claimed.lease_token}',10,'Live worker heartbeat',300) as reported`)).rows[0].reported, true);
    assert.equal((await db.query<{ lease_live: boolean }>(`select lease_expires_at>now() as lease_live from public.background_jobs where id='${firstJob}'`)).rows[0].lease_live, true);
    assert.equal((await db.query("select * from public.claim_background_job(60)")).rows.length, 0, "the same workspace cannot run two jobs concurrently");
    await db.exec(`delete from public.background_jobs where id='${siblingJob}'`);
    assert.equal((await db.query<{ advanced: boolean }>(`select public.advance_background_job('${firstJob}','${claimed.lease_token}','{\"source\":\"json\",\"offset\":10}'::jsonb,20,'Batch 1 complete') as advanced`)).rows[0].advanced, true);
    claimed = (await db.query<{ id: string; attempt_count: number; lease_token: string }>("select id,attempt_count,lease_token from public.claim_background_job(60)")).rows[0];
    assert.equal(claimed.attempt_count, 1, "continuation chunks do not consume retry attempts");
    assert.equal((await db.query<{ progress: number }>(`select progress_percent as progress from public.background_jobs where id='${firstJob}'`)).rows[0].progress, 20);
    assert.equal((await db.query<{ status: string }>(`select public.retry_background_job('${firstJob}','${claimed.lease_token}','temporary test failure') as status`)).rows[0].status, "retrying");
    await db.exec(`update public.background_jobs set next_retry_at=now()-interval '1 second' where id='${firstJob}'`);
    claimed = (await db.query<{ id: string; attempt_count: number; lease_token: string }>("select id,attempt_count,lease_token from public.claim_background_job(60)")).rows[0];
    assert.equal(claimed.attempt_count, 2, "retry attempts increment only after the backoff state");
    assert.equal((await db.query<{ completed: boolean }>(`select public.complete_background_job('${firstJob}','${claimed.lease_token}','{\"synced\":10}'::jsonb) as completed`)).rows[0].completed, true);
    assert.deepEqual((await db.query<{ status: string; progress: number }>(`select status,progress_percent as progress from public.background_jobs where id='${firstJob}'`)).rows[0], { status: "completed", progress: 100 });
    const retryJob = (await db.query<{ id: string }>("select id from public.enqueue_background_job('retry_user','retry.example','audit_enrichment','retry-limit-test','{}'::jsonb)")).rows[0].id;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const lease = (await db.query<{ attempt_count: number; lease_token: string }>("select attempt_count,lease_token from public.claim_background_job(60)")).rows[0];
      assert.equal(lease.attempt_count, attempt);
      const state = (await db.query<{ status: string }>(`select public.retry_background_job('${retryJob}','${lease.lease_token}','retry ${attempt}') as status`)).rows[0].status;
      assert.equal(state, attempt === 3 ? "failed" : "retrying");
      if (attempt < 3) await db.exec(`update public.background_jobs set next_retry_at=now()-interval '1 second' where id='${retryJob}'`);
    }
    for (let i = 0; i < 10; i++) await db.query(`select id from public.enqueue_background_job('queue_user','queue.example','listicle_crawl','queue-depth-${i}','{}'::jsonb)`);
    await assert.rejects(db.query("select id from public.enqueue_background_job('queue_user','queue.example','listicle_crawl','queue-depth-limit','{}'::jsonb)"), /queue is full/);
    for (let i = 0; i < 20; i++) {
      const rateJob = (await db.query<{ id: string }>(`select id from public.enqueue_background_job('rate_user','rate.example','audit_enrichment','rate-limit-${i}','{}'::jsonb)`)).rows[0].id;
      await db.exec(`update public.background_jobs set status='completed' where id='${rateJob}'`);
    }
    await assert.rejects(db.query("select id from public.enqueue_background_job('rate_user','rate.example','audit_enrichment','rate-limit-over','{}'::jsonb)"), /rate limit reached/);
    assert.equal((await db.query<{ allowed: boolean }>(`select public.consume_forensic_teaser_rate_limit('${"a".repeat(64)}',2) as allowed`)).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>(`select public.consume_forensic_teaser_rate_limit('${"a".repeat(64)}',2) as allowed`)).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>(`select public.consume_forensic_teaser_rate_limit('${"a".repeat(64)}',2) as allowed`)).rows[0].allowed, false);
    const source = ts.createSourceFile("database.types.ts", await readFile(new URL("../lib/database.types.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const alias = source.statements.find((item): item is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(item) && item.name.text === "Database");
    assert.ok(alias && ts.isTypeLiteralNode(alias.type));
    function property(node: ts.TypeLiteralNode, name: string): ts.TypeNode {
      const item = node.members.find((member): member is ts.PropertySignature => ts.isPropertySignature(member) && member.name.getText(source).replaceAll('"', "") === name);
      assert.ok(item?.type, `Missing TypeScript property ${name}`);
      return item.type;
    }
    const publicNode = property(alias.type, "public"); assert.ok(ts.isTypeLiteralNode(publicNode));
    const tables = property(publicNode, "Tables"); assert.ok(ts.isTypeLiteralNode(tables));
    for (const table of tables.members) {
      if (!ts.isPropertySignature(table) || !table.type || !ts.isTypeLiteralNode(table.type)) continue;
      const tableName = table.name.getText(source).replaceAll('"', "");
      const row = property(table.type, "Row"); assert.ok(ts.isTypeLiteralNode(row));
      for (const column of row.members) {
        if (!ts.isPropertySignature(column) || !column.type) continue;
        const columnName = column.name.getText(source).replaceAll('"', "");
        const sql = result.rows.find(item => item.table_name === tableName && item.column_name === columnName);
        assert.ok(sql, `TypeScript references missing ${tableName}.${columnName}`);
        const nullable = column.type.kind === ts.SyntaxKind.UnknownKeyword || ts.isUnionTypeNode(column.type) && column.type.types.some(type => ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword);
        assert.equal(nullable, sql.is_nullable === "YES", `Nullability differs for ${tableName}.${columnName}`);
      }
    }
    await db.exec("insert into public.audits (domain, user_id, status) values ('example.com', 'user_test', 'completed')");
    for (let i = 0; i < 120; i++) assert.equal((await db.query<{ allowed: boolean }>("select public.claim_pixel_intercept_quota('example.com') as allowed")).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>("select public.claim_pixel_intercept_quota('example.com') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query<{ allowed: boolean }>("select public.claim_pixel_intercept_quota('unknown.example') as allowed")).rows[0].allowed, false);
    await db.exec("update public.pixel_intercept_quotas set window_started_at = now() - interval '61 seconds'");
    assert.equal((await db.query<{ allowed: boolean }>("select public.claim_pixel_intercept_quota('example.com') as allowed")).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>("select public.reserve_workspace_agent_scan('user_test','example.com') as allowed")).rows[0].allowed, true);
    await db.exec("update public.workspace_governance_policies set monthly_scan_quota=1,scans_used_this_month=0 where user_id='user_test' and workspace_domain='example.com'");
    assert.equal((await db.query<{ allowed: boolean }>("select public.reserve_workspace_agent_scan('user_test','example.com') as allowed")).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>("select public.reserve_workspace_agent_scan('user_test','example.com') as allowed")).rows[0].allowed, false);
    await db.exec("update public.workspace_governance_policies set usage_month=(date_trunc('month',now()) - interval '1 month')::date where user_id='user_test' and workspace_domain='example.com'");
    assert.equal((await db.query<{ allowed: boolean }>("select public.reserve_workspace_agent_scan('user_test','example.com') as allowed")).rows[0].allowed, true);
    await db.exec("update public.workspace_governance_policies set api_rate_limit_per_minute=2,observation_retention_days=180,require_two_person_redirect_approval=true where user_id='user_test' and workspace_domain='example.com'; insert into public.workspace_api_keys(user_id,workspace_domain,key_hash,key_prefix) values ('user_test','example.com',repeat('a',64),'cm_live_test')");
    const rateKey=(await db.query<{id:string}>("select id from public.workspace_api_keys where user_id='user_test'")).rows[0].id;
    assert.equal((await db.query<{allowed:boolean}>(`select public.consume_workspace_api_rate_limit('${rateKey}',2) as allowed`)).rows[0].allowed,true);
    assert.equal((await db.query<{allowed:boolean}>(`select public.consume_workspace_api_rate_limit('${rateKey}',2) as allowed`)).rows[0].allowed,true);
    assert.equal((await db.query<{allowed:boolean}>(`select public.consume_workspace_api_rate_limit('${rateKey}',2) as allowed`)).rows[0].allowed,false);
    await assert.rejects(db.exec("update public.workspace_governance_policies set observation_retention_days=30"),/workspace_governance_policies_observation_retention_days_check/);
    await db.exec("insert into public.audits(id,domain,user_id,status) values ('10000000-0000-4000-8000-000000000001','example.com','user_test','completed')");
    await db.exec("insert into public.broken_links(id,audit_id,cited_url,http_status,suggested_redirect,url_state,approval_status,match_confidence) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','https://example.com/pending',404,'https://example.com/new-pending','404','pending_review',94),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','https://example.com/approved',404,'https://example.com/new-approved','404','approved',85)");
    await db.exec("insert into public.redirect_rules(user_id,source_link_id,source_host,source_path,destination,active) values ('user_test','20000000-0000-4000-8000-000000000001','example.com','/pending','https://example.com/new-pending',true),('user_test','20000000-0000-4000-8000-000000000002','example.com','/approved','https://example.com/new-approved',true)");
    await db.exec("insert into public.action_audit_logs(workspace_domain,actor_user_id,action_type,safety_check_passed) values ('example.com','user_test','redirect_preview',true)");
    await assert.rejects(db.exec("update public.action_audit_logs set safety_check_passed = false"), /append-only/);
    await assert.rejects(db.exec("insert into public.citation_hijack_opportunities(domain,opportunity_type,prompt_query,target_url,lifecycle_stage) values ('example.com','competitor_direct_404','best software','https://competitor.example/404','won')"), /citation_hijack_lifecycle_stage_check/);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from pg_constraint where conname = 'citation_hijack_lifecycle_stage_check'")).rows[0].count, 1);
    await db.exec("set role anon;");
    assert.deepEqual((await db.query<{ destination: string }>("select destination from public.redirect_rules")).rows, [{ destination: "https://example.com/new-approved" }]);
    await assert.rejects(db.query("select * from workspace_integrations"), /permission denied/);
    await assert.rejects(db.query("select * from rescued_ai_visits"), /permission denied/);
    await assert.rejects(db.query("select * from sitemap_pages"), /permission denied/);
    await assert.rejects(db.query("select * from pixel_intercept_quotas"), /permission denied/);
    await assert.rejects(db.query("select * from action_audit_logs"), /permission denied/);
    await assert.rejects(db.query("select public.claim_pixel_intercept_quota('example.com')"), /permission denied/);
    for (const table of ["ai_observation_evidence", "recovery_outcomes", "webhook_events_log", "workspace_api_keys", "autonomous_agent_runs", "ecommerce_catalog_items", "organization_members", "workspace_governance_policies", "scheduled_reports", "citation_change_events", "background_jobs", "founder_weekly_scorecards"]) await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    await assert.rejects(db.query("select public.reserve_workspace_agent_scan('user_test','example.com')"), /permission denied/);
    assert.equal((await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='audits'")).rows[0].relrowsecurity, true);

    // Personal owners see only their own workspace, while a verified organization
    // member receives the stored role's scoped access for the claimed organization.
    await db.exec("reset role; insert into public.audits (domain,user_id,status) values ('other.example','other_owner','completed'),('org.example','org_owner','completed'); insert into public.organization_members(organization_id,owner_user_id,member_user_id,role) values ('org_acme','org_owner','org_viewer','viewer'),('org_acme','org_owner','org_editor','editor');");
    await db.exec("set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"user_test\"}',false);");
    assert.deepEqual((await db.query<{ domain: string }>("select distinct domain from public.audits order by domain")).rows, [{ domain: "example.com" }]);
    await assert.rejects(db.query("select key_hash from public.workspace_api_keys"), /permission denied/);
    await assert.rejects(db.exec("insert into public.audits(domain,user_id,status) values ('spoofed.example','other_owner','completed')"), /row-level security|policy/);
    await db.exec("reset role; set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"org_viewer\",\"org_id\":\"org_acme\"}',false);");
    assert.deepEqual((await db.query<{ domain: string }>("select domain from public.audits where user_id='org_owner'")).rows, [{ domain: "org.example" }]);
    assert.equal((await db.query<{ id: string }>("delete from public.audits where domain='org.example' returning id")).rows.length, 0, "verified viewers cannot delete tenant data");
    await assert.rejects(db.exec("insert into public.audits(domain,user_id,status) values ('org-spoof.example','org_owner','completed')"), /row-level security|policy/);
    await db.exec("reset role; set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"org_editor\",\"org_id\":\"org_acme\"}',false);");
    await db.exec("insert into public.audits(domain,user_id,status) values ('org-editor-workspace.example','org_owner','completed')");
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.audits where domain='org-editor-workspace.example'")).rows[0].count, 1);
    await db.exec("reset role; set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"org_editor\"}',false);");
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.audits where user_id='org_owner'")).rows[0].count, 0);
    await db.exec("reset role; set role service_role;");
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.audits")).rows[0].count >= 4, true, "service role retains cross-tenant server access");
    await db.query("select * from public.workspace_integrations");
  } finally { await db.close(); }
});
