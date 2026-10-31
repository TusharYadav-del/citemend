import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { grantsProAccess, hasProSubscription } from "../lib/subscription";

const now = Date.parse("2026-11-01T00:00:00Z");
test("Pro access respects subscription status and cancellation grace period", () => {
  for (const status of ["active", "on_trial", "past_due"]) assert.equal(grantsProAccess({ status, cancelled: false, ends_at: null }, now), true);
  for (const status of ["expired", "unpaid", "paused"]) assert.equal(grantsProAccess({ status, cancelled: false, ends_at: null }, now), false);
  assert.equal(grantsProAccess({ status: "cancelled", cancelled: true, ends_at: "2026-11-02T00:00:00Z" }, now), true);
  assert.equal(grantsProAccess({ status: "cancelled", cancelled: true, ends_at: "2026-10-31T00:00:00Z" }, now), false);
  assert.equal(grantsProAccess({ status: "active", cancelled: true, ends_at: null }, now), false);
  assert.equal(grantsProAccess({ status: "expired", cancelled: true, ends_at: "2026-11-02T00:00:00Z" }, now), false);
});

const oldFetch = globalThis.fetch;
const oldEnv = process.env;
afterEach(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });
test("subscription lookup scopes results to the verified user and fails closed on database errors", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("user_id"), "eq.user_123");
    return Response.json([{ status: "active", cancelled: false, ends_at: null }]);
  };
  assert.equal(await hasProSubscription("user_123"), true);
  globalThis.fetch = async () => Response.json([]);
  assert.equal(await hasProSubscription("user_123"), false);
  globalThis.fetch = async () => Response.json({ message: "Unavailable" }, { status: 503 });
  await assert.rejects(hasProSubscription("user_123"), /temporarily unavailable/);
  await assert.rejects(hasProSubscription(" "), /authenticated user ID/);
});
