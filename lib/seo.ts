import "server-only";
import { assertPublicUrl, publicFetch } from "./public-http";
import { gunzipSync } from "node:zlib";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SITEMAPS = 50;
const MAX_URLS = 50_000;
const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, trimValues: true });

function httpUrl(value: string): URL {
  const url = assertPublicUrl(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Expected an HTTP(S) URL without credentials.");
  }
  url.hash = "";
  return url;
}

function domainOrigin(domain: string): URL {
  const input = domain.trim();
  const url = httpUrl(input.includes("://") ? input : `https://${input}`);
  if (url.pathname !== "/" || url.search || !url.hostname) throw new Error("Expected a domain or site origin, without a path or query.");
  return url;
}

async function request(url: URL, method: "HEAD" | "GET", signal: AbortSignal): Promise<Response> {
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted();
    const response = await publicFetch(url, {
      method, signal, redirect: "manual", cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Citemend/1.0", Accept: "application/xml,text/plain,*/*" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("Redirect response has no Location header.");
    url = httpUrl(new URL(location, url).href);
  }
  throw new Error("Too many redirects (maximum 5).");
}

async function readText(response: Response, limit: number): Promise<string> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Sitemap discovery request returned HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error(`Sitemap discovery document exceeds ${limit} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let bytes: Uint8Array = Buffer.concat(chunks);
  // fetch already decompresses HTTP Content-Encoding; gzip files may still be compressed.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes, { maxOutputLength: limit });
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function locations(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap((item) => {
    const loc = record(item).loc;
    if (typeof loc !== "string") return [];
    try { return [httpUrl(loc.trim()).href]; } catch { return []; }
  });
}

function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("Sitemap XML must not contain a DTD or entity declarations.");
  if (XMLValidator.validate(xml) !== true) throw new Error("Invalid sitemap XML.");
  const root = record(parser.parse(xml));
  const urlset = Object.hasOwn(root, "urlset");
  const index = Object.hasOwn(root, "sitemapindex");
  if (urlset === index) throw new Error("Expected a urlset or sitemapindex XML document.");
  return urlset
    ? { pages: locations(record(root.urlset).url), sitemaps: [] }
    : { pages: [], sitemaps: locations(record(root.sitemapindex).sitemap) };
}

/** Discovers pages; throws if discovery fails or configured bounds would truncate results. */
export async function fetchSitemapUrls(domain: string): Promise<string[]> {
  const origin = domainOrigin(domain);
  const signal = AbortSignal.timeout(8_000);
  const seen = new Set<string>();
  const pages = new Set<string>();
  async function load(url: string): Promise<void> {
    if (seen.has(url)) return;
    if (seen.size >= MAX_SITEMAPS) throw new Error(`Sitemap traversal exceeds ${MAX_SITEMAPS} documents.`);
    seen.add(url);
    const sitemap = parseSitemap(await readText(await request(httpUrl(url), "GET", signal), MAX_BYTES));
    for (const page of sitemap.pages) {
      pages.add(page);
      if (pages.size > MAX_URLS) throw new Error(`Sitemap contains more than ${MAX_URLS} unique URLs.`);
    }
    for (const child of sitemap.sitemaps) await load(child);
  }
  const primary = new URL("/sitemap.xml", origin).href;
  try {
    await load(primary);
  } catch (primaryError) {
    signal.throwIfAborted();
    // Retry discovery from robots.txt with a fresh traversal, never return partial data.
    seen.clear();
    pages.clear();
    const robots = await readText(await request(new URL("/robots.txt", origin), "GET", signal), 512 * 1024);
    const advertised = [...new Set(robots.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
      if (!match) return [];
      try { return [httpUrl(new URL(match[1], origin).href).href]; } catch { return []; }
    }))];
    if (!advertised.length) throw new Error("No usable sitemap found at /sitemap.xml or in robots.txt.", { cause: primaryError });
    for (const sitemap of advertised) await load(sitemap);
  }
  return [...pages];
}

/** Returns the final HTTP status; invalid URLs, timeouts, and network failures reject. */
export async function checkUrlStatus(url: string, parentSignal?: AbortSignal): Promise<number> {
  const target = httpUrl(url);
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000);
  let response = await request(target, "HEAD", signal);
  const status = response.status;
  await response.body?.cancel();
  // Some servers reject HEAD even though the page is available via GET.
  if ([403, 405, 501].includes(status)) {
    response = await request(target, "GET", signal);
    const getStatus = response.status;
    await response.body?.cancel();
    return getStatus;
  }
  return status;
}


/** Server-only semantic sitemap indexing; keeps existing discovery/status APIs intact. */
export async function indexDomainSitemap(domain: string, options: import("./sitemap-embeddings").SitemapIndexOptions = {}) {
  const semantic = await import("./sitemap-embeddings");
  return semantic.indexDomainSitemap(domain, options);
}
