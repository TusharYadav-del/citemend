import "server-only";
import { buildRedirectExport, type ExportableRedirect, type RedirectExportFormat } from "@/lib/redirect-export";
import { hasProSubscription } from "@/lib/subscription";

type ExportDependencies = {
  isConfigured?: () => boolean;
  getUserId?: () => Promise<string | null>;
  hasPro?: typeof hasProSubscription;
};

export function createRedirectExportHandler(dependencies: ExportDependencies = {}) {
  const isConfigured = dependencies.isConfigured ?? (() => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY));
  const getUserId = dependencies.getUserId ?? (async () => (await (await import("@clerk/nextjs/server")).auth()).userId);
  const hasPro = dependencies.hasPro ?? hasProSubscription;
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
    if (!links.every((link) => link && typeof link === "object" && typeof (link as ExportableRedirect).cited_url === "string" && typeof (link as ExportableRedirect).http_status === "number" && (typeof (link as ExportableRedirect).suggested_redirect === "string" || (link as ExportableRedirect).suggested_redirect === null))) {
      return Response.json({ error: "Invalid export data." }, { status: 400 });
    }
    const validLinks = links as ExportableRedirect[];
    const htaccess = buildRedirectExport(data.domain, validLinks, "htaccess");
    if (!htaccess.includes("\nRedirect 301 ")) return Response.json({ error: "No verified redirect is available to export." }, { status: 422 });
    const content = data.single
      ? htaccess.split("\n").slice(1).join("\n")
      : buildRedirectExport(data.domain, validLinks, data.format as RedirectExportFormat);
    return Response.json({ content });
  };
}
