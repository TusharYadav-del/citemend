import "server-only";
import { normalizeDashboardDomain } from "./audit-dashboard";
import { checkUrlStatus } from "./seo";

type PreviewDependencies = { checkStatus?: typeof checkUrlStatus };

export function createSitePreviewHandler(dependencies: PreviewDependencies = {}) {
  const checkStatus = dependencies.checkStatus ?? checkUrlStatus;
  return async function POST(request: Request): Promise<Response> {
    let input: unknown;
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Enter a valid domain." }, { status: 400 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    // Bound streamed uploads before parsing; disconnected and stalled clients
    // must not turn a public preview into an unhandled error or a hung request.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(new Error("Body read timed out.")); }, 5_000);
    });
    try {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 500) {
          void reader.cancel().catch(() => {});
          return Response.json({ error: "Enter a domain only." }, { status: 413 });
        }
        chunks.push(value);
      }
      input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      void reader.cancel().catch(() => {});
      return Response.json({ error: timedOut ? "The request took too long. Try again." : "Enter a valid domain." }, { status: timedOut ? 408 : 400 });
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
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
