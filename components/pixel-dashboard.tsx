"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ShopifySyncModal from "@/components/ShopifySyncModal";
import InterceptorSandbox from "@/components/interceptor-sandbox";

type Rule = { id: string; source_path: string; target_url: string; confidence: number | null; is_active: boolean; hits_recovered: number; created_at: string };
type PixelEvent = { id: string; broken_path: string; ai_referrer: string; redirected_to: string | null; created_at: string };
type PixelData = { domain: string; domains: string[]; rules: Rule[]; events: PixelEvent[]; webhookConfigured: boolean };
type Platform = "shopify" | "wordpress" | "nextjs" | "sitebuilder";
type PixelDashboardProps = { initialData: PixelData; appOrigin: string; initialError?: string };

const PLATFORMS: { id: Platform; label: string; title: string; help: string }[] = [
  { id: "shopify", label: "Shopify", title: "Add to your theme", help: "Open Online Store → Themes → Edit code, then paste the snippet inside `layout/theme.liquid` before `</head>`." },
  { id: "wordpress", label: "WordPress", title: "Add to your site header", help: "Paste the snippet in your theme header before `</head>`, or use your approved header/footer code plugin." },
  { id: "nextjs", label: "Next.js", title: "Add to your root layout", help: "Paste the script in the root layout's `<head>` in `app/layout.tsx` or `pages/_document.tsx`." },
  { id: "sitebuilder", label: "Webflow / Framer", title: "Add custom head code", help: "Paste the snippet into your site's custom code / head code settings, then publish the site." },
];

function sourceLabel(value: string): string {
  const host = value.toLowerCase();
  if (host.includes("chatgpt.com")) return "ChatGPT";
  if (host.includes("perplexity.ai")) return "Perplexity";
  if (host.includes("claude.ai")) return "Claude";
  if (host.includes("gemini.google.com")) return "Gemini";
  if (host.includes("copilot.microsoft.com")) return "Copilot";
  if (host.includes("you.com")) return "You.com";
  return value || "Unknown";
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string") return new Error(body.error);
  } catch {}
  return new Error("The request could not be completed. Try again.");
}

export default function PixelDashboard({ initialData, appOrigin, initialError = "" }: PixelDashboardProps) {
  const [data, setData] = useState<PixelData>(initialData);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const origin = appOrigin;
  const [platform, setPlatform] = useState<Platform>("shopify");
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [webhookDraft, setWebhookDraft] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>(() => Object.fromEntries(initialData.rules.map(rule => [rule.id, rule.target_url])));

  const load = useCallback(async (domain?: string, quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const query = domain ? `?domain=${encodeURIComponent(domain)}` : "";
      const response = await fetch(`/api/pixel/dashboard${query}`, { cache: "no-store" });
      if (!response.ok) throw await responseError(response);
      const next = await response.json() as PixelData;
      setData(next);
      setTargets(Object.fromEntries(next.rules.map(rule => [rule.id, rule.target_url])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pixel activity is temporarily unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!data.domain) return;
    const timer = window.setInterval(() => { void load(data.domain, true); }, 30_000);
    return () => window.clearInterval(timer);
  }, [data.domain, load]);

  const snippet = useMemo(() => data.domain
    ? `<script async src="${origin.replace(/\/$/, "")}/citefix-pixel.js" data-domain="${data.domain}"></script>`
    : "", [data.domain, origin]);
  const recovered = data.rules.reduce((sum, rule) => sum + rule.hits_recovered, 0);
  const activeRules = data.rules.filter(rule => rule.is_active);

  async function copySnippet() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setNotice("Pixel snippet copied. Paste it into your site head and publish.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was blocked. Select and copy the snippet manually.");
    }
  }

  async function updateRule(rule: Rule, update: { isActive?: boolean; targetUrl?: string }) {
    setBusyAction(rule.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/pixel/dashboard", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, domain: data.domain, ...update }),
      });
      if (!response.ok) throw await responseError(response);
      setNotice(update.isActive === undefined ? "Redirect destination updated." : `Redirect ${update.isActive ? "enabled" : "disabled"}.`);
      await load(data.domain, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The redirect rule could not be updated.");
    } finally {
      setBusyAction("");
    }
  }

  async function simulateVisit() {
    const rule = activeRules[0];
    if (!rule) return;
    setBusyAction("simulation");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/pixel/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: data.domain, brokenPath: rule.source_path, referrer: "https://chatgpt.com", fullUrl: `https://${data.domain}${rule.source_path}` }),
      });
      const result = await response.json() as { redirectUrl?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The pixel test failed.");
      if (typeof result.redirectUrl !== "string") throw new Error("No active redirect resolved for this test path.");
      setNotice(`Test visit recovered: ${rule.source_path} → ${new URL(result.redirectUrl).pathname}. Activity is refreshed below.`);
      await load(data.domain, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The pixel test could not reach the resolver.");
    } finally {
      setBusyAction("");
    }
  }

  async function saveWebhook(remove = false) {
    if (!data.domain) return;
    setBusyAction("webhook-save");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/pixel/dashboard", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveWebhook", domain: data.domain, webhookUrl: remove ? "" : webhookDraft.trim() }),
      });
      if (!response.ok) throw await responseError(response);
      setWebhookDraft("");
      setNotice(remove ? "Webhook removed." : "Webhook saved privately.");
      await load(data.domain, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Webhook settings could not be saved.");
    } finally {
      setBusyAction("");
    }
  }

  async function sendTestAlert() {
    if (!data.domain || !data.webhookConfigured) return;
    setBusyAction("webhook-test");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/pixel/dashboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: data.domain }),
      });
      if (!response.ok) throw await responseError(response);
      const result = await response.json() as { provider?: string };
      setNotice(`Test alert sent to ${result.provider === "discord" ? "Discord" : "Slack"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Test alert could not be delivered.");
    } finally {
      setBusyAction("");
    }
  }

  const rows = useMemo(() => {
    const merged = new Map<string, { path: string; event?: PixelEvent; rule?: Rule }>();
    for (const event of data.events) {
      const row = merged.get(event.broken_path) ?? { path: event.broken_path };
      if (!row.event) row.event = event;
      merged.set(event.broken_path, row);
    }
    for (const rule of data.rules) {
      const row = merged.get(rule.source_path) ?? { path: rule.source_path };
      row.rule = rule;
      merged.set(rule.source_path, row);
    }
    return [...merged.values()];
  }, [data.events, data.rules]);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[#dfe5dc] pb-6">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-[#53704e] hover:underline"><ArrowLeft className="size-4" /> Dashboard</Link>
          <p className="mt-5 text-[10px] font-semibold tracking-[.18em] text-[#53704e]">PIXEL &amp; RECOVERED TRAFFIC</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#182c25]">Turn AI 404s into recovered visits</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736b]">Install the lightweight pixel, then monitor AI referrals and the redirects recovering your visitors.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">{data.domains.length > 1 && <label className="grid gap-1 text-xs font-medium text-[#68736b]">Domain<select className="h-10 min-w-52 rounded-lg border border-[#dfe5dc] bg-white px-3 text-sm text-[#182c25]" value={data.domain} onChange={event => void load(event.target.value)}>{data.domains.map(domain => <option key={domain}>{domain}</option>)}</select></label>}
          <ShopifySyncModal domain={data.domain} redirectRules={activeRules.map(rule => ({ id: rule.id, sourcePath: rule.source_path }))} onSynced={() => void load(data.domain, true)} />
        </div>
      </header>

      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}

      <section className="mb-7 grid gap-4 sm:grid-cols-3" aria-label="Pixel activity summary">
        {[{ label: "Recovered AI visitors", value: recovered, detail: "Confirmed visits sent through active redirects" }, { label: "AI 404 events", value: data.events.length, detail: "Most recent 100 events for this domain" }, { label: "Active redirects", value: activeRules.length, detail: "Rules ready to recover a visit" }].map(card => <article key={card.label} className="rounded-2xl border border-[#dfe5dc] bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#557447]">{card.label}</p><p className="mt-3 text-3xl font-semibold tabular-nums text-[#182c25]">{card.value.toLocaleString()}</p><p className="mt-2 text-xs leading-5 text-[#68736b]">{card.detail}</p></article>)}
      </section>

      <section className="mb-8 rounded-2xl border border-[#dfe5dc] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#557447]">Install your pixel</p><h2 className="mt-2 text-xl font-semibold text-[#182c25]">1-Minute Installation</h2><p className="mt-1 text-sm text-[#68736b]">Add one line to your site head. It only runs on detected 404 pages.</p></div>
          {data.domain && <span className="rounded-full bg-[#f1f5ed] px-3 py-1.5 text-xs font-medium text-[#44653c]">{data.domain}</span>}
        </div>
        {loading ? <div className="h-24 animate-pulse rounded-xl bg-[#f1f4ed]" /> : !data.domain ? <div className="rounded-xl border border-dashed border-[#d6dfce] p-5 text-sm leading-6 text-[#68736b]">Run an audit while signed in to associate a domain with your account. Its domain will appear here with a ready-to-copy snippet.</div> : <>
          <Tabs value={platform} onValueChange={value => setPlatform(value as Platform)}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-[#f1f4ed] p-1">
              {PLATFORMS.map(item => <TabsTrigger key={item.id} value={item.id} className="min-h-9 flex-none px-3 text-xs sm:text-sm">{item.label}</TabsTrigger>)}
            </TabsList>
            {PLATFORMS.map(item => <TabsContent key={item.id} value={item.id} className="mt-5">
              <h3 className="text-sm font-semibold text-[#182c25]">{item.title}</h3><p className="mt-1 text-sm leading-6 text-[#68736b]">{item.help}</p>
            </TabsContent>)}
          </Tabs>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-[#172c24] p-4 text-xs leading-6 text-[#e6f0e7]"><code>{snippet}</code></pre>
            <button type="button" onClick={() => void copySnippet()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#214d39] px-4 text-sm font-medium text-white hover:bg-[#183e2d] disabled:opacity-50" disabled={!snippet}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy Snippet"}</button>
          </div>
        </>}
      </section>

      <InterceptorSandbox domain={data.domain} origin={origin} />
      <section className="mb-8 rounded-2xl border border-[#dfe5dc] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#557447]">Team notifications</p><h2 className="mt-2 text-xl font-semibold text-[#182c25]">Slack &amp; Discord alerts</h2><p className="mt-1 text-sm leading-6 text-[#68736b]">Get a message when an AI referral is recovered. Webhook credentials stay on the server and are never returned to this page.</p></div>
        {!data.domain ? <p className="rounded-xl border border-dashed border-[#d6dfce] p-4 text-sm text-[#68736b]">Run an audit first to associate an alert destination with a domain.</p> : <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input type="url" autoComplete="off" spellCheck={false} aria-label="Slack or Discord incoming webhook URL" value={webhookDraft} onChange={event => setWebhookDraft(event.target.value)} placeholder={data.webhookConfigured ? "Webhook saved privately — paste a new URL to replace it" : "https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."} className="h-10 min-w-0 flex-1 rounded-lg border border-[#dfe5dc] px-3 text-sm text-[#182c25] placeholder:text-[#899189]" />
            <button type="button" onClick={() => void saveWebhook()} disabled={!webhookDraft.trim() || busyAction === "webhook-save"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#214d39] px-4 text-sm font-medium text-white hover:bg-[#183e2d] disabled:opacity-50">{busyAction === "webhook-save" ? <LoaderCircle className="size-4 animate-spin" /> : null}Save Webhook</button>
            <button type="button" onClick={() => void sendTestAlert()} disabled={!data.webhookConfigured || busyAction === "webhook-test"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe5dc] px-4 text-sm font-medium text-[#36583f] hover:bg-[#f7f8f4] disabled:opacity-50">{busyAction === "webhook-test" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Send Test Alert</button>
            {data.webhookConfigured && <button type="button" onClick={() => void saveWebhook(true)} disabled={busyAction === "webhook-save"} className="h-10 rounded-lg px-3 text-sm text-[#68736b] hover:bg-[#f7f8f4] disabled:opacity-50">Remove</button>}
          </div>
          {data.webhookConfigured && <p className="mt-3 text-xs text-[#557447]">A Slack or Discord webhook is configured for {data.domain}.</p>}
        </>}
      </section>

      <section className="mb-8 rounded-2xl border border-[#dfe5dc] bg-[#f7f8f4] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-white p-2.5 text-[#557447]"><ShieldCheck className="size-5" /></div><div><h2 className="font-semibold text-[#182c25]">Verify resolver / simulate an AI 404 visit</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#68736b]">Tests the resolver using your first active rule and records one ChatGPT test event. This checks routing and telemetry; it does not confirm that the script is installed on your website.</p></div></div>
          <button type="button" onClick={() => void simulateVisit()} disabled={!activeRules.length || busyAction === "simulation" || loading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#214d39] px-4 text-sm font-medium text-white hover:bg-[#183e2d] disabled:cursor-not-allowed disabled:opacity-50">{busyAction === "simulation" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Simulate 404 AI Visit</button>
        </div>
        {!loading && !activeRules.length && data.domain && <p className="mt-4 text-xs text-[#68736b]">Enable an active redirect below before running the simulation. Publishing rules requires a Pro subscription.</p>}
      </section>

      <section className="rounded-2xl border border-[#dfe5dc] bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0e9] p-5 sm:px-6">
          <div><h2 className="text-lg font-semibold text-[#182c25]">Recovered traffic</h2><p className="mt-1 text-xs text-[#68736b]">Latest AI 404 events and redirect rules. Auto-refreshes every 30 seconds.</p></div>
          <button type="button" onClick={() => void load(data.domain || undefined, true)} disabled={loading || refreshing} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe5dc] bg-white px-3 text-xs font-medium text-[#36583f] hover:bg-[#f7f8f4] disabled:opacity-50"><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="bg-[#f7f8f4] text-[11px] uppercase tracking-wide text-[#68736b]"><tr><th className="px-5 py-3 font-semibold">Broken path</th><th className="px-5 py-3 font-semibold">AI source</th><th className="px-5 py-3 font-semibold">Auto-matched target</th><th className="px-5 py-3 font-semibold">Hits recovered</th><th className="px-5 py-3 font-semibold">Rule</th></tr></thead>
            <tbody className="divide-y divide-[#edf0e9]">
              {loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-[#68736b]">Loading pixel activity…</td></tr> : rows.length ? rows.map(row => <tr key={row.path} className="align-top">
                <td className="max-w-64 break-all px-5 py-4 font-medium text-[#182c25]">{row.path}<p className="mt-1 text-[11px] font-normal text-[#899189]">{row.event ? new Date(row.event.created_at).toLocaleString() : "Rule created"}</p></td>
                <td className="px-5 py-4">{row.event ? <span className="inline-flex rounded-full border border-[#dfe5dc] bg-[#f1f5ed] px-2.5 py-1 text-xs font-medium text-[#44653c]">{sourceLabel(row.event.ai_referrer)}</span> : <span className="text-xs text-[#899189]">No visit yet</span>}</td>
                <td className="max-w-[28rem] px-5 py-4">{row.rule ? <div className="flex min-w-72 gap-2"><input aria-label={`Target for ${row.path}`} value={targets[row.rule.id] ?? row.rule.target_url} onChange={event => setTargets(current => ({ ...current, [row.rule!.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-lg border border-[#dfe5dc] px-2.5 text-xs text-[#182c25]" /><button type="button" onClick={() => void updateRule(row.rule!, { targetUrl: targets[row.rule!.id] ?? row.rule!.target_url })} disabled={busyAction === row.rule.id || (targets[row.rule.id] ?? row.rule.target_url) === row.rule.target_url} className="rounded-lg border border-[#dfe5dc] px-3 text-xs font-medium text-[#36583f] hover:bg-[#f7f8f4] disabled:opacity-40">Save</button></div> : row.event?.redirected_to ? <a className="inline-flex max-w-96 items-center gap-1 break-all text-xs text-[#456936] hover:underline" href={row.event.redirected_to} target="_blank" rel="noreferrer">{row.event.redirected_to}<ExternalLink className="size-3 shrink-0" /></a> : <span className="text-xs text-[#899189]">No redirect matched</span>}</td>
                <td className="px-5 py-4 font-semibold tabular-nums text-[#182c25]">{row.rule?.hits_recovered.toLocaleString() ?? "—"}</td>
                <td className="px-5 py-4">{row.rule ? <button type="button" role="switch" aria-checked={row.rule.is_active} aria-label={`${row.rule.is_active ? "Disable" : "Enable"} redirect for ${row.path}`} onClick={() => void updateRule(row.rule!, { isActive: !row.rule!.is_active })} disabled={busyAction === row.rule.id} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${row.rule.is_active ? "bg-[#3e7149]" : "bg-[#c7cec5]"}`}><span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${row.rule.is_active ? "translate-x-6" : "translate-x-1"}`} /></button> : <span className="text-xs text-[#899189]">No rule</span>}</td>
              </tr>) : <tr><td colSpan={5} className="px-5 py-14 text-center"><p className="font-medium text-[#182c25]">No pixel activity yet</p><p className="mt-2 text-sm text-[#68736b]">Install the snippet and incoming AI 404 events will appear here.</p></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="border-t border-[#edf0e9] px-5 py-3 text-[11px] leading-5 text-[#899189] sm:px-6">Only redirects belonging to your account are editable. Recovered-hit counts come from the resolver and may include your simulations.</footer>
      </section>
      <p className="mt-6 text-center text-xs text-[#899189]">Pixel resolution stays on the customer domain. <Link href="/dashboard" className="font-medium text-[#53704e] hover:underline">Return to audit history</Link>.</p>
    </main>
  );
}
