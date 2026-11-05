import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import ts from "typescript";

test("migrations 001 through 024 apply in order and expose the columns used by the application", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const files = (await readdir(directory)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort();
    assert.deepEqual(files.map(name => name.slice(0, 3)), Array.from({ length: 24 }, (_, index) => String(index + 1).padStart(3, "0")));
    for (const file of files) await db.exec(await readFile(new URL(file, directory), "utf8"));
    const expected: Record<string, string[]> = {
      audits: ["id", "user_id", "domain", "buyer_prompt", "status", "created_at", "competitor_domains", "ground_truth_pricing", "indexnow_key", "share_of_model_score", "engine_matrix_json", "agency_brand_name", "agency_logo_url", "agency_primary_color", "agency_cta_url", "agency_cta_text", "llms_txt_content", "webhook_url", "sitemap_url_count"],
      broken_links: ["id", "audit_id", "cited_url", "http_status", "suggested_redirect", "url_state", "approval_status", "approved_by", "approved_at", "previous_destination_url", "deployed_at", "rolled_back_at", "match_evidence_reason", "match_confidence", "created_at"],
      subscriptions: ["id", "user_id", "store_id", "product_id", "variant_id", "status", "plan", "current_period_end", "ends_at", "cancelled", "provider_updated_at"],
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
      rescued_ai_visits: ["id", "domain", "broken_path", "rescued_target_url", "ai_referrer", "similarity_score", "latency_ms", "created_at"],
      workspace_integrations: ["id", "user_id", "domain", "slack_webhook_url", "discord_webhook_url", "shopify_store_domain", "shopify_admin_token", "agency_brand_name", "agency_logo_url", "agency_primary_color", "agency_cta_url", "agency_cta_text"],
      pixel_intercept_quotas: ["domain", "window_started_at", "request_count"],
      ai_observation_evidence: ["id", "audit_id", "domain", "prompt_query", "prompt_version", "provider", "model_name", "search_method", "locale", "raw_answer", "extracted_urls_json", "sample_size", "observation_confidence", "job_status", "retry_count", "error_message", "observed_at"],
      recovery_outcomes: ["id", "audit_id", "domain", "broken_link_id", "canonical_destination_url", "technical_deployment_verified_at", "ai_citation_observed_at", "evidence_id", "created_at"],
      webhook_events_log: ["id", "event_id", "provider", "event_type", "delivery_status", "retry_count", "last_error", "received_at", "completed_at"],
      workspace_api_keys: ["id", "user_id", "workspace_domain", "key_hash", "key_prefix", "permissions_json", "rate_limit_per_minute", "last_used_at", "created_at", "revoked_at"],
      autonomous_agent_runs: ["id", "user_id", "workspace_domain", "audit_id", "opportunity_id", "broken_link_id", "action_type", "risk_level", "current_step", "run_status", "human_approved_by", "human_approved_at", "evidence_json", "recommendation_json", "result_json", "stage_history_json", "rollback_snapshot_json", "rollback_completed_at", "error_message", "created_at", "updated_at"],
      ecommerce_catalog_items: ["id", "user_id", "workspace_domain", "platform", "external_item_id", "canonical_url", "product_json", "synced_at"],
      organization_members: ["id", "organization_id", "owner_user_id", "member_user_id", "role", "created_at"],
      workspace_governance_policies: ["id", "user_id", "workspace_domain", "monthly_scan_quota", "scans_used_this_month", "usage_month", "entity_truth_baseline_json", "created_at", "updated_at"],
      scheduled_reports: ["id", "user_id", "workspace_domain", "report_type", "schedule_at", "status", "payload_json", "created_at", "updated_at"],
      citation_change_events: ["id", "user_id", "workspace_domain", "audit_id", "previous_observation_id", "current_observation_id", "prompt_query", "event_type", "source_url", "replacement_url", "evidence_json", "detected_at"],
    };
    const result = await db.query<{ table_name: string; column_name: string; is_nullable: string }>("select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public'");
    for (const [table, columns] of Object.entries(expected)) {
      const actual = new Set(result.rows.filter(row => row.table_name === table).map(row => row.column_name));
      for (const column of columns) assert.ok(actual.has(column), `${table}.${column} is missing`);
    }
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
    for (const table of ["ai_observation_evidence", "recovery_outcomes", "webhook_events_log", "workspace_api_keys", "autonomous_agent_runs", "ecommerce_catalog_items", "organization_members", "workspace_governance_policies", "scheduled_reports", "citation_change_events"]) await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    await assert.rejects(db.query("select public.reserve_workspace_agent_scan('user_test','example.com')"), /permission denied/);
  } finally { await db.close(); }
});
