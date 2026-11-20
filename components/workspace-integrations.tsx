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
  return <section id="settings" className="mb-6 rounded-xl border border-border bg-surface p-5"><h2 className="text-base font-semibold text-foreground">Settings · Integrations &amp; alerts</h2>{!domain ? <p className="mt-2 text-sm text-text-secondary">Run an audit to configure a domain.</p> : <>
    {domains.length > 1 && <label className="mt-3 block text-xs text-text-secondary">Domain <select value={domain} onChange={event => { setDomain(event.target.value); setStatus(null); setSlack(""); setDiscord(""); setToken(""); setNotice(""); }} className="ml-2 rounded bg-surface-raised p-2">{domains.map(item => <option key={item}>{item}</option>)}</select></label>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-text-secondary">Slack webhook {status?.slackConfigured && "· configured"}<input type="password" autoComplete="off" value={slack} onChange={event => setSlack(event.target.value)} placeholder="Paste a new Slack webhook" className="mt-1 w-full rounded border border-border bg-surface-raised p-2 text-sm text-foreground" /></label><label className="text-xs text-text-secondary">Discord webhook {status?.discordConfigured && "· configured"}<input type="password" autoComplete="off" value={discord} onChange={event => setDiscord(event.target.value)} placeholder="Paste a new Discord webhook" className="mt-1 w-full rounded border border-border bg-surface-raised p-2 text-sm text-foreground" /></label><label className="text-xs text-text-secondary">Shopify store domain<input value={store} onChange={event => setStore(event.target.value)} placeholder="store.myshopify.com" className="mt-1 w-full rounded border border-border bg-surface-raised p-2 text-sm text-foreground" /></label><label className="text-xs text-text-secondary">Shopify Admin token {status?.shopifyConfigured && "· configured"}<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste a new Admin token" className="mt-1 w-full rounded border border-border bg-surface-raised p-2 text-sm text-foreground" /></label></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void request("save")} className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-background hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">Save settings</button><button type="button" disabled={busy || !status?.slackConfigured} onClick={() => void request("test", "slack")} className="rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">Send Slack test alert</button><button type="button" disabled={busy || !status?.discordConfigured} onClick={() => void request("test", "discord")} className="rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">Send Discord test alert</button></div><p className="mt-2 text-xs text-text-secondary">Shopify token storage requires SHOPIFY_TOKEN_ENCRYPTION_KEY. Saved secrets are never displayed.</p><p role="status" className="mt-2 text-xs text-success">{notice}</p>
  </>}</section>;
}
