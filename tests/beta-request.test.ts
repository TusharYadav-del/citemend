import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { betaInvitationAllowed, requestDesignPartnerBeta } from "../lib/beta-request";
import { grantsProAccess, hasProSubscription } from "../lib/subscription";

const originalFetch = globalThis.fetch;
const originalEnv = process.env;
afterEach(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });

function setup(invites: string) {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-key", BETA_INVITED_EMAILS: invites };
  const rows: Record<string, unknown>[] = [];
  const methods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/rest/v1/subscriptions");
    const method = init?.method ?? "GET";
    methods.push(method);
    const matches = rows.filter((row) => {
      for (const field of ["user_id", "plan", "email", "id", "status"]) {
        const value = url.searchParams.get(field);
        if (value?.startsWith("eq.") && row[field] !== value.slice(3)) return false;
      }
      return true;
    });
    if (method === "GET") return Response.json(url.searchParams.get("select") === "user_id" ? matches[0] ?? null : matches);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (method === "POST") {
      const row = { cancelled: false, ends_at: null, ...body };
      rows.push(row);
      return Response.json(row);
    }
    if (method === "PATCH") {
      const row = matches[0];
      if (row) Object.assign(row, body);
      return Response.json(url.searchParams.get("select") ? row ?? null : []);
    }
    throw new Error("Unexpected method");
  };
  return { rows, methods };
}

test("invited email receives exactly 30 days; repeat requests cannot extend it", async () => {
  const { rows, methods } = setup(" Other@example.com, VIP@Example.com ");
  const start = new Date("2026-11-02T00:00:00Z");
  assert.equal(betaInvitationAllowed("vip@example.com"), true);
  const first = await requestDesignPartnerBeta("user_123", "VIP@example.com", "example.com", start);
  assert.equal(first.unlocked, true);
  assert.equal(first.currentPeriodEnd, "2026-12-02T00:00:00.000Z");
  assert.equal(rows[0].status, "active");
  assert.equal(rows[0].plan, "pro_beta");
  assert.equal(grantsProAccess(rows[0] as Parameters<typeof grantsProAccess>[0], start.getTime()), true);
  const again = await requestDesignPartnerBeta("user_123", "VIP@example.com", "example.com", new Date("2026-11-10T00:00:00Z"));
  assert.equal(again.currentPeriodEnd, first.currentPeriodEnd);
  assert.equal(methods.filter((method) => method === "POST").length, 1);
});

test("expired beta loses access and persists expired status without deleting records", async () => {
  const { rows, methods } = setup("vip@example.com");
  await requestDesignPartnerBeta("user_123", "vip@example.com", "example.com", new Date("2026-11-02T00:00:00Z"));
  const expired = await requestDesignPartnerBeta("user_123", "vip@example.com", "example.com", new Date("2026-12-02T00:00:00Z"));
  assert.equal(expired.unlocked, false);
  assert.equal(rows[0].status, "expired");
  assert.equal(rows.length, 1);
  assert.equal(methods.includes("DELETE"), false);
  assert.equal(grantsProAccess(rows[0] as Parameters<typeof grantsProAccess>[0], Date.parse("2026-12-02T00:00:00Z")), false);
  const repeat = await requestDesignPartnerBeta("user_123", "vip@example.com", "example.com", new Date("2026-12-03T00:00:00Z"));
  assert.equal(repeat.unlocked, false);
});

test("access checks expire old beta grants even without another beta request", async () => {
  const { rows } = setup("vip@example.com");
  rows.push({ id: "beta:user_123", user_id: "user_123", email: "vip@example.com", domain: "example.com", plan: "pro_beta", status: "active", current_period_end: "2020-01-01T00:00:00Z", cancelled: false, ends_at: "2020-01-01T00:00:00Z" });
  assert.equal(await hasProSubscription("user_123"), false);
  assert.equal(rows[0].status, "expired");
  assert.equal(rows.length, 1);
});

test("non-invited user remains pending and cannot gain quota", async () => {
  const { rows } = setup("");
  const result = await requestDesignPartnerBeta("user_123", "founder@example.com", "example.com");
  assert.equal(result.unlocked, false);
  assert.equal(rows[0].status, "pending_beta");
  assert.equal(grantsProAccess(rows[0] as Parameters<typeof grantsProAccess>[0]), false);
  assert.equal(await hasProSubscription("user_123"), false);
});

test("paid subscription remains active and is never overwritten by beta request", async () => {
  const { rows, methods } = setup("");
  rows.push({ id: "paid_1", user_id: "user_123", status: "active", cancelled: false, ends_at: null, plan: null, current_period_end: null });
  const result = await requestDesignPartnerBeta("user_123", "founder@example.com", "example.com");
  assert.equal(result.unlocked, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "active");
  assert.equal(methods.includes("POST"), false);
  assert.equal(await hasProSubscription("user_123"), true);
});
