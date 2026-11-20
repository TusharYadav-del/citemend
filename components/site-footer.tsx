import Link from "next/link";

const groups = [
  { title: "Product", links: [["Platform", "/#platform"], ["Pricing", "/pricing"], ["Workspace", "/dashboard"], ["Integrations", "/integrations"], ["Benchmarks", "/benchmarks"]] },
  { title: "Solutions", links: [["Agencies", "/solutions/agencies"], ["B2B SaaS", "/solutions/saas"], ["Ecommerce", "/solutions/ecommerce"], ["Enterprise", "/solutions/enterprise"]] },
  { title: "Resources & Help", links: [["Help Center", "/help"], ["Support", "/support"], ["System status", "/status"], ["Changelog", "/changelog"], ["About", "/about"]] },
  { title: "Legal & Trust", links: [["Terms", "/terms"], ["Privacy", "/privacy"], ["Refunds", "/refund-policy"], ["Acceptable use", "/acceptable-use"], ["Cookies & pixel", "/cookies"], ["DPA", "/dpa"], ["Security", "/security"], ["Subprocessors", "/subprocessors"]] },
];

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-border bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Link href="/" className="rounded-sm text-lg font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-accent">CiteMend</Link>
          <p className="mt-3 max-w-xs text-sm leading-6 text-text-tertiary">The AI Search Recovery layer between AI answers and canonical websites.</p>
        </div>
        {groups.map(group => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-sm font-semibold text-foreground">{group.title}</h2>
            <ul className="mt-3 space-y-2.5">
              {group.links.map(([label, href]) => (
                <li key={href}><Link href={href} className="rounded-sm text-sm text-text-secondary transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto mt-9 max-w-7xl border-t border-border pt-4 text-xs text-text-tertiary">© CiteMend · Discover · Verify · Recover</p>
    </footer>
  );
}
