import "server-only";
import { buildRedirectExport, type ExportableRedirect, type RedirectExportFormat } from "@/lib/redirect-export";
import { hasProSubscription } from "@/lib/subscription";
import { createServerDatabase } from "@/lib/supabase-server";

type ExportDependencies = {
  isConfigured?: () => boolean;
  getUserId?: () => Promise<string | null>;
  hasPro?: typeof hasProSubscription;
  verifyOwnedLinks?: (userId: string, domain: string, links: ExportableRedirect[]) => Promise<ExportableRedirect[]>;
};

export function createRedirectExportHandler(dependencies: ExportDependencies = {}) {
  const isConfigured = dependencies.isConfigured ?? (() => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY));
  const getUserId = dependencies.getUserId ?? (async () => (await (await import("@clerk/nextjs/server")).auth()).userId);
  const hasPro = dependencies.hasPro ?? hasProSubscription;
  const verifyOwnedLinks = dependencies.verifyOwnedLinks ?? (async (userId: string, domain: string, requested: ExportableRedirect[]) => {
    const sourceUrls = [...new Set(requested.map(link => link.cited_url))];
    const { data, error } = await createServerDatabase().from("broken_links")
      .select("cited_url,http_status,suggested_redirect,approval_status,audits!inner(user_id,domain)")
      .in("cited_url", sourceUrls).eq("audits.user_id", userId).eq("audits.domain", domain);
    if (error) throw error;
    const owned = new Map((data ?? []).map(link => [link.cited_url, link]));
    return requested.flatMap(link => {
      const saved = owned.get(link.cited_url);
      if (!saved || saved.http_status !== link.http_status || saved.suggested_redirect !== link.suggested_redirect || saved.approval_status !== link.approval_status) return [];
      return [{ cited_url: saved.cited_url, http_status: saved.http_status, suggested_redirect: saved.suggested_redirect, approval_status: saved.approval_status }];
    });
  });
  return async function POST(request: Request) {
    if (!isConfigured()) {
      return Response.json({ error: "Sign-in is not configured." }, { status: 503 });
    }
    let userId: string | null;
    try { userId = await getUserId(); } catch {
      return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
    }
    if (!userId) return Response.json({ error: "Sign in to export redirects.", code: "SIGN_IN_REQUIRED" }, { status: 401 });

    try {
      if (!await hasPro(userId)) {
        return Response.json({ error: "Upgrade to Pro to export redirects.", code: "PRO_REQUIRED" }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Subscription status is temporarily unavailable." }, { status: 503 });
    }

    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Missing export data." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel().catch(() => {}); return Response.json({ error: "Export data is too large." }, { status: 413 }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }

    let data: { domain?: unknown; links?: unknown; format?: unknown; single?: unknown };
    try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return Response.json({ error: "Invalid export data." }, { status: 400 }); }
    if (!data || typeof data.domain !== "string" || !/^[a-z0-9.-]{1,253}$/.test(data.domain) || !Array.isArray(data.links) || data.links.length > 50 || !["htaccess", "vercel", "shopify"].includes(String(data.format)) || (data.single !== undefined && typeof data.single !== "boolean")) {
      return Response.json({ error: "Invalid export data." }, { status: 400 });
    }
    const links = data.links as unknown[];
    if (!links.every((link) => link && typeof link === "object" && typeof (link as ExportableRedirect).cited_url === "string" && typeof (link as ExportableRedirect).http_status === "number" && (typeof (link as ExportableRedirect).suggested_redirect === "string" || (link as ExportableRedirect).suggested_redirect === null) && typeof (link as ExportableRedirect).approval_status === "string")) {
      return Response.json({ error: "Invalid export data." }, { status: 400 });
    }
    const requested = links as ExportableRedirect[];
    const approvalCandidates = requested.filter(link => link.http_status === 404 && !!link.suggested_redirect && ["approved", "deployed"].includes(link.approval_status));
    if (!approvalCandidates.length) return Response.json({ error: "No human-approved redirect is available to export." }, { status: 422 });
    let validLinks: ExportableRedirect[];
    try {
      validLinks = await verifyOwnedLinks(userId, data.domain, approvalCandidates);
    } catch { return Response.json({ error: "Could not verify saved redirect approvals." }, { status: 503 }); }
    const htaccess = buildRedirectExport(data.domain, validLinks, "htaccess");
    if (!htaccess.includes("\nRedirect 301 ")) return Response.json({ error: "No verified redirect is available to export." }, { status: 422 });
    const content = data.single
      ? htaccess.split("\n").slice(1).join("\n")
      : buildRedirectExport(data.domain, validLinks, data.format as RedirectExportFormat);
    return Response.json({ content });
  };
}
