export interface WorkerEnv {
  REDIRECTS: KVNamespace;
  ORIGIN_URL?: string;
}

type RedirectRule = { active: boolean; destination: string };
const AI_REFERRERS = ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com"];

export function isAiReferrer(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password &&
      AI_REFERRERS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function redirectKey(url: URL): string {
  return `redirect:v1:${url.hostname.toLowerCase()}:${url.pathname}`;
}

function destinationFor(value: string | null, source: URL): URL | null {
  if (!value) return null;
  try {
    const rule: unknown = JSON.parse(value);
    if (!rule || typeof rule !== "object") return null;
    const { active, destination } = rule as RedirectRule;
    if (active !== true || typeof destination !== "string") return null;
    const url = new URL(destination);
    if (url.protocol !== "https:" || url.hostname !== source.hostname || url.port || url.username || url.password || url.hash) return null;
    if (url.pathname === source.pathname) return null;
    return url;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const upstream = env.ORIGIN_URL ? new URL(url.pathname + url.search, env.ORIGIN_URL) : url;
    const originResponse = await fetch(new Request(upstream, request));
    if (request.method !== "GET" && request.method !== "HEAD") return originResponse;
    if (originResponse.status !== 404 && !isAiReferrer(request.headers.get("Referer"))) return originResponse;

    let value: string | null;
    try {
      value = await env.REDIRECTS.get(redirectKey(url));
    } catch {
      return originResponse;
    }
    const destination = destinationFor(value, url);
    if (!destination) return originResponse;
    await originResponse.body?.cancel().catch(() => {});
    return new Response(null, { status: 301, headers: { Location: destination.href, "Cache-Control": "no-store" } });
  },
} satisfies ExportedHandler<WorkerEnv>;
