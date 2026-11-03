"use client";
import { useEffect, useState } from "react";

type Status = { slackConfigured: boolean; discordConfigured: boolean; shopifyConfigured: boolean; shopifyStore: string };
export default function WorkspaceIntegrations({ domains }: { domains: string[] }) {
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const [slack, setSlack] = useState(""); const [discord, setDiscord] = useState("");
  const [store, setStore] = useState(""); const [token, setToken] = useState("");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    fetch("/api/workspace/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", domain }) }).then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Status>; }).then(value => { if (!cancelled) { setStatus(value); setStore(value.shopifyStore); } }).catch(() => { if (!cancelled) setNotice("Integration settings could not be loaded."); });
    return () => { cancelled = true; };
  }, [domain]);
  async function request(action: "save" | "test", provider?: "slack" | "discord") {
    setBusy(true); setNotice("");
    try {
      const payload = action === "test" ? { action, domain, provider } : { action, domain, ...(slack ? { slack_webhook_url: slack } : {}), ...(discord ? { discord_webhook_url: discord } : {}), ...(store ? { shopify_store_domain: store } : {}), ...(token ? { shopify_admin_token: token } : {}) };
      const response = await fetch("/api/workspace/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The request failed.");
      if (action === "save") { setStatus(current => ({ slackConfigured: !!slack || !!current?.slackConfigured, discordConfigured: !!discord || !!current?.discordConfigured, shopifyConfigured: !!(store && (token || current?.shopifyConfigured)), shopifyStore: store })); setSlack(""); setDiscord(""); setToken(""); }
      setNotice(action === "test" ? "Test alert sent." : "Integration settings saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The request failed."); }
    finally { setBusy(false); }
  }
  return <section id="settings" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-base font-semibold text-white">Settings · Integrations &amp; alerts</h2>{!domain ? <p className="mt-2 text-sm text-slate-400">Run an audit to configure a domain.</p> : <>
    {domains.length > 1 && <label className="mt-3 block text-xs text-slate-300">Domain <select value={domain} onChange={event => { setDomain(event.target.value); setStatus(null); setSlack(""); setDiscord(""); setToken(""); setNotice(""); }} className="ml-2 rounded bg-slate-800 p-2">{domains.map(item => <option key={item}>{item}</option>)}</select></label>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-300">Slack webhook {status?.slackConfigured && "· configured"}<input type="password" autoComplete="off" value={slack} onChange={event => setSlack(event.target.value)} placeholder="Paste a new Slack webhook" className="mt-1 w-full rounded border border-white/10 bg-black/30 p-2 text-sm text-white" /></label><label className="text-xs text-slate-300">Discord webhook {status?.discordConfigured && "· configured"}<input type="password" autoComplete="off" value={discord} onChange={event => setDiscord(event.target.value)} placeholder="Paste a new Discord webhook" className="mt-1 w-full rounded border border-white/10 bg-black/30 p-2 text-sm text-white" /></label><label className="text-xs text-slate-300">Shopify store domain<input value={store} onChange={event => setStore(event.target.value)} placeholder="store.myshopify.com" className="mt-1 w-full rounded border border-white/10 bg-black/30 p-2 text-sm text-white" /></label><label className="text-xs text-slate-300">Shopify Admin token {status?.shopifyConfigured && "· configured"}<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste a new Admin token" className="mt-1 w-full rounded border border-white/10 bg-black/30 p-2 text-sm text-white" /></label></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void request("save")} className="rounded bg-emerald-400 px-3 py-2 text-xs font-semibold text-black">Save settings</button><button type="button" disabled={busy || !status?.slackConfigured} onClick={() => void request("test", "slack")} className="rounded border border-white/20 px-3 py-2 text-xs disabled:opacity-40">Send Slack test alert</button><button type="button" disabled={busy || !status?.discordConfigured} onClick={() => void request("test", "discord")} className="rounded border border-white/20 px-3 py-2 text-xs disabled:opacity-40">Send Discord test alert</button></div><p className="mt-2 text-xs text-slate-400">Shopify token storage requires SHOPIFY_TOKEN_ENCRYPTION_KEY. Saved secrets are never displayed.</p><p role="status" className="mt-2 text-xs text-emerald-300">{notice}</p>
  </>}</section>;
}
