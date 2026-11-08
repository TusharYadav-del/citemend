import Link from "next/link";

const groups = [
  { title: "Product", links: [["Platform", "/#platform"], ["Pricing", "/pricing"], ["Workspace", "/dashboard"], ["Integrations", "/integrations"], ["Benchmarks", "/benchmarks"]] },
  { title: "Solutions", links: [["Agencies", "/solutions/agencies"], ["B2B SaaS", "/solutions/saas"], ["Ecommerce", "/solutions/ecommerce"], ["Enterprise", "/solutions/enterprise"]] },
  { title: "Resources & Help", links: [["Help Center", "/help"], ["Support", "/support"], ["System status", "/status"], ["Changelog", "/changelog"], ["About", "/about"]] },
  { title: "Legal & Trust", links: [["Terms", "/terms"], ["Privacy", "/privacy"], ["Refunds", "/refund-policy"], ["Acceptable use", "/acceptable-use"], ["Cookies & pixel", "/cookies"], ["DPA", "/dpa"], ["Security", "/security"], ["Subprocessors", "/subprocessors"]] },
];

export function SiteFooter() {
  return <footer className="site-footer border-t border-white/[.08] bg-[#05070b] px-5 py-10 text-slate-300 sm:px-8"><div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]"><div><Link href="/" className="text-lg font-semibold tracking-tight text-white">CiteMend</Link><p className="mt-3 max-w-xs text-xs leading-6 text-slate-500">The AI Search Recovery layer between AI answers and canonical websites.</p></div>{groups.map(group => <nav key={group.title} aria-label={group.title}><h2 className="text-xs font-semibold text-white">{group.title}</h2><ul className="mt-3 space-y-2">{group.links.map(([label, href]) => <li key={href}><Link href={href} className="text-xs text-slate-400 hover:text-emerald-300">{label}</Link></li>)}</ul></nav>)}</div><p className="mx-auto mt-9 max-w-7xl border-t border-white/[.07] pt-4 text-[10px] text-slate-600">© CiteMend · Discover · Verify · Recover</p></footer>;
}
