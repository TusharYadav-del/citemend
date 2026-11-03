import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { generateLlmsTxt, type DeprecatedPath, type LlmsPage } from "@/lib/llms-txt";
import { readRequestJson } from "@/lib/read-request-json";

export async function POST(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; }
  catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503 }); }
  if (!userId) return Response.json({ error: "Sign in to generate llms.txt files." }, { status: 401 });
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind === "too_large") return Response.json({ error: "Request body exceeds 4 KiB." }, { status: 413 });
  if (parsed.kind !== "ok") return Response.json({ error: "Send a valid JSON request." }, { status: 400 });
  const input = parsed.value;
  if (!input || typeof input !== "object" || typeof (input as { domain?: unknown }).domain !== "string") return Response.json({ error: "Provide a domain." }, { status: 400 });
  const domain = ((input as { domain: string }).domain).trim().toLowerCase();
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return Response.json({ error: "Enter a hostname such as example.com." }, { status: 400 });

  try {
    const db = createServerDatabase();
    const { data: audit, error: auditError } = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (auditError) throw auditError;
    if (!audit) return Response.json({ error: "Run an audit for this domain first so generation uses your account's saved evidence." }, { status: 403 });
    const [pagesResult, brokenResult] = await Promise.all([
      db.from("sitemap_pages").select("url,page_title").eq("domain", domain).order("updated_at", { ascending: false }).limit(30),
      db.from("broken_links").select("cited_url,suggested_redirect,audits!inner(user_id,domain)").eq("audits.user_id", userId).eq("audits.domain", domain).eq("http_status", 404).not("suggested_redirect", "is", null).limit(100),
    ]);
    if (pagesResult.error || brokenResult.error) throw pagesResult.error ?? brokenResult.error;
    const pages = (pagesResult.data ?? []) as LlmsPage[];
    const deprecated = (brokenResult.data ?? []).map((row) => ({ url: row.cited_url, replacement: row.suggested_redirect })) as DeprecatedPath[];
    const generated = await generateLlmsTxt(domain, pages, deprecated);
    const { error: saveError } = await db.from("audits").update({ llms_txt_content: generated.llmsTxt }).eq("id", audit.id).eq("user_id", userId);
    if (saveError) throw saveError;
    return Response.json(generated, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 503;
    const message = error instanceof Error ? error.message : "llms.txt generation is temporarily unavailable.";
    return Response.json({ error: message }, { status });
  }
}
