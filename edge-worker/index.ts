export interface WorkerEnv {
  REDIRECTS: KVNamespace;
  ORIGIN_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
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

async function activeRule(url: URL, env: WorkerEnv): Promise<string | null> {
  if (env.SUPABASE_URL || env.SUPABASE_ANON_KEY) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
    const project = new URL(env.SUPABASE_URL);
    if (project.protocol !== "https:") return null;
    const api = new URL("/rest/v1/redirect_rules", project);
    api.searchParams.set("select", "destination");
    api.searchParams.set("source_host", `eq.${url.hostname.toLowerCase()}`);
    api.searchParams.set("source_path", `eq.${url.pathname}`);
    api.searchParams.set("active", "eq.true");
    api.searchParams.set("limit", "1");
    const response = await fetch(api, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Accept: "application/json" },
      cf: { cacheEverything: true, cacheTtl: 5 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") return null;
    const destination = (rows[0] as { destination?: unknown }).destination;
    return typeof destination === "string" ? JSON.stringify({ active: true, destination }) : null;
  }
  return env.REDIRECTS.get(redirectKey(url));
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
      value = await activeRule(url, env);
    } catch {
      return originResponse;
    }
    const destination = destinationFor(value, url);
    if (!destination) return originResponse;
    await originResponse.body?.cancel().catch(() => {});
    return new Response(null, { status: 301, headers: { Location: destination.href, "Cache-Control": "no-store" } });
  },
} satisfies ExportedHandler<WorkerEnv>;
