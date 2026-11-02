import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

test("pgvector migration executes, isolates domains/models, orders cosine matches, and denies public access", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await readFile(new URL("../supabase/migrations/009_pgvector_sitemaps.sql", import.meta.url), "utf8"));
    const embedding = (a: number, b = 0) => JSON.stringify([a, b, ...Array(766).fill(0)]);
    for (const [domain, url, values, model] of [
      ["example.com", "https://example.com/pricing", embedding(1), "gemini-embedding-001"],
      ["example.com", "https://example.com/features", embedding(0.8, 0.6), "gemini-embedding-001"],
      ["other.com", "https://other.com/pricing", embedding(1), "gemini-embedding-001"],
      ["example.com", "https://example.com/old-model", embedding(1), "other-model"],
    ]) {
      await db.query("insert into sitemap_pages(domain,url,page_title,embedding,embedding_model) values ($1,$2,'Title',$3::extensions.vector,$4)", [domain, url, values, model]);
    }
    await db.exec("grant usage on schema public, extensions to service_role; set role service_role;");
    const matches = await db.query<{url: string; similarity: number}>("select * from match_sitemap_url($1::extensions.vector, 'example.com', 0.75, 5)", [embedding(1)]);
    assert.deepEqual(matches.rows.map(x => x.url), ["https://example.com/pricing", "https://example.com/features"]);
    assert.equal(matches.rows[0].similarity, 1);
    assert.ok(Math.abs(matches.rows[1].similarity - 0.8) < 0.00001);
    const limited = await db.query("select * from match_sitemap_url($1::extensions.vector,'example.com',0.9,1)", [embedding(1)]);
    assert.equal(limited.rows.length, 1);
    await assert.rejects(db.query("select * from match_sitemap_url($1::extensions.vector,'example.com',0.9,1)", [embedding(0)]), /nonzero/);
    await assert.rejects(db.query("select * from match_sitemap_url('[1,0]'::extensions.vector,'example.com',0.9,1)"), /768/);
    await db.exec("reset role; set role anon;");
    await assert.rejects(db.query("select * from sitemap_pages"), /permission denied/);
    await assert.rejects(db.query("select * from match_sitemap_url($1::extensions.vector,'example.com',0.5,1)", [embedding(1)]), /permission denied/);
  } finally { await db.close(); }
});
