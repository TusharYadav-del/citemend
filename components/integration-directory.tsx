"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const integrations = [
  { name: "Shopify", category: "Commerce", availability: "Connected integration", description: "Sync catalog products and export reviewed product redirects.", guide: ["Open the workspace integrations panel.", "Enter your Shopify store domain and Admin API token.", "Sync products or review redirect exports."], deepLink: "/dashboard#workspaces" },
  { name: "Cloudflare", category: "Recovery", availability: "Verified export", description: "Export reviewed 301 rules for the CiteMend edge worker.", guide: ["Review and approve a destination in Recovery Center.", "Export Cloudflare-compatible redirect data.", "Attach the worker to your zone and verify the final HTTP 200."], deepLink: "/dashboard#redirect-export" },
  { name: "Vercel", category: "Recovery", availability: "301 export", description: "Download permanent Vercel redirect configuration from approved mappings.", guide: ["Approve a verified redirect.", "Export the Vercel format.", "Deploy and verify the redirect in your project."], deepLink: "/dashboard#redirect-export" },
  { name: "Next.js", category: "Recovery", availability: "301 export", description: "Use the approved redirect export in a Next.js deployment workflow.", guide: ["Review the exact source and destination paths.", "Export Vercel/Next.js-compatible rules.", "Deploy and run a loop-free verification."], deepLink: "/dashboard#redirect-export" },
  { name: "GitHub PR Bot", category: "Developer tools", availability: "Manual PR workflow", description: "Prepare a reviewable redirect change and open a pull request through your existing GitHub workflow.", guide: ["Export the approved redirect data.", "Add the change to your repository with a human reviewer.", "Deploy through your normal GitHub checks."], deepLink: "/dashboard#redirect-export" },
  { name: "Slack", category: "Notifications", availability: "Webhook integration", description: "Send test alerts and recovery notifications to a workspace channel.", guide: ["Create a Slack incoming webhook.", "Save it in Workspace Settings → Integrations & alerts.", "Send a test alert to verify delivery."], deepLink: "/dashboard#workspaces" },
  { name: "Discord", category: "Notifications", availability: "Webhook integration", description: "Send recovery alerts to a Discord channel through a webhook.", guide: ["Create a Discord channel webhook.", "Save it in Workspace Settings → Integrations & alerts.", "Send a test alert."], deepLink: "/dashboard#workspaces" },
  { name: "Resend", category: "Email", availability: "Scheduled reports", description: "Deliver scheduled workspace reports using the configured Resend sender.", guide: ["Configure RESEND_API_KEY and a verified sender.", "Create a scheduled report in workspace settings.", "Use the scheduled-report worker to dispatch due reports."], deepLink: "/dashboard#workspaces" },
  { name: "IndexNow", category: "Discovery", availability: "Submission support", description: "Submit eligible updated URLs to the IndexNow endpoint; this is a notification, not an indexing or ranking guarantee.", guide: ["Add the IndexNow key to the workspace audit settings.", "Verify the key file is publicly reachable.", "Submit URLs and inspect the returned provider status."], deepLink: "/dashboard#workspaces" },
  { name: "Clerk SSO", category: "Identity", availability: "Organization SSO", description: "Use Clerk organization sessions and verified membership roles for workspace access.", guide: ["Configure an identity provider in Clerk.", "Enable the organization SSO connection for your account.", "Invite members and verify their workspace role."], deepLink: "/dashboard#workspaces" },
  { name: "MCP Agents", category: "Developer tools", availability: "Public MCP endpoint", description: "Connect coding and marketing agents to scoped read tools and approval-gated redirect proposals.", guide: ["Create a workspace API key with the needed permissions.", "Point your MCP client at /api/mcp.", "Review every proposed redirect in CiteMend before approval."], deepLink: "/developers" },
] as const;

const categories = ["All", ...new Set(integrations.map((item) => item.category))];

export function IntegrationDirectory() {
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => integrations.filter((item) => (category === "All" || item.category === category) && `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase())), [category, search]);

  return <>
    <section aria-label="Directory filters" className="mb-6 rounded-xl border border-white/10 bg-[#0D1119] p-4">
      <label className="block max-w-xl text-xs font-medium text-slate-300" htmlFor="integration-search">Find an integration</label>
      <Input id="integration-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search integrations" className="mt-2 border-white/10 bg-black/20 text-white placeholder:text-slate-500" />
      <div role="group" aria-label="Filter integrations by category" className="mt-4 flex flex-wrap gap-2">
        {categories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)} className={`${buttonVariants({ size: "sm", variant: category === item ? "default" : "outline" })} ${category === item ? "bg-[#37F5A0] text-[#07110d] hover:bg-emerald-200" : "border-white/15 text-slate-300"}`}>{item}</button>)}
      </div>
    </section>
    {filtered.length ? <section aria-label="Available integrations" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((item) => <Card key={item.name} className="border-white/10 bg-[#0D1119] text-[#F5F7FA]">
        <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base font-semibold">{item.name}</CardTitle><p className="mt-1 text-xs text-slate-500">{item.category}</p></div><Badge variant="outline" className="border-cyan-300/20 text-cyan-100">{item.availability}</Badge></div><p className="text-sm leading-6 text-slate-400">{item.description}</p></CardHeader>
        <CardContent><h2 className="text-xs font-semibold text-slate-200">Setup guide</h2><ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-slate-400">{item.guide.map((step) => <li key={step}>{step}</li>)}</ol></CardContent>
        <CardFooter className="justify-end border-white/10 bg-white/[.025]"><Link href={item.deepLink} className={buttonVariants({ variant: "outline", size: "sm" })}>Open setup</Link></CardFooter>
      </Card>)}
    </section> : <p role="status" className="rounded-xl border border-white/10 bg-[#0D1119] p-6 text-sm text-slate-400">No integrations match this filter.</p>}
  </>;
}
