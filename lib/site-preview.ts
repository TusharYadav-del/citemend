import "server-only";
import { normalizeDashboardDomain } from "./audit-dashboard";
import { checkUrlStatus } from "./seo";

type PreviewDependencies = { checkStatus?: typeof checkUrlStatus };

export function createSitePreviewHandler(dependencies: PreviewDependencies = {}) {
  const checkStatus = dependencies.checkStatus ?? checkUrlStatus;
  return async function POST(request: Request): Promise<Response> {
    const body = await request.text();
    if (body.length > 500) return Response.json({ error: "Enter a domain only." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(body); } catch { return Response.json({ error: "Enter a valid domain." }, { status: 400 }); }
    const value = input && typeof input === "object" && "domain" in input ? (input as { domain: unknown }).domain : null;
    if (typeof value !== "string" || value.length > 300) return Response.json({ error: "Enter a valid domain." }, { status: 400 });

    let domain: string;
    try { domain = normalizeDashboardDomain(value); }
    catch { return Response.json({ error: "Enter a public domain such as example.com, without a page path." }, { status: 400 }); }

    const [homepageStatus, sitemapStatus] = await Promise.all([
      checkStatus(`https://${domain}/`).catch(() => null),
      checkStatus(`https://${domain}/sitemap.xml`).catch(() => null),
    ]);
    return Response.json({ domain, homepageStatus, sitemapStatus, previewOnly: true }, { headers: { "Cache-Control": "no-store" } });
  };
}
