import CitationCapsuleModal from "@/components/CitationCapsuleModal";
import type { CitationGap } from "@/lib/citation-gap";
export default function CitationGapPanel({domain,gap}:{domain:string;gap:CitationGap}) {
  return <section aria-label="Citation gap opportunities" className="mt-6 rounded-xl border border-amber-200 bg-[#fffdf6] p-4 sm:p-5">
    <h3 className="text-base font-semibold">Your domain was omitted from this answer</h3>
    <p className="mt-2 text-xs leading-5 text-[#68736b]">The answer linked to these external sources. Review whether each source is a competitor; citation presence does not establish ranking or why the model chose it.</p>
    <p className="mt-3 break-words text-sm"><span className="font-medium">Buyer prompt:</span> {gap.buyerPrompt}</p>
    <p className="mt-1 break-words text-[11px] text-[#68736b]">Citation evidence: {gap.provider}</p>
    <ul className="mt-4 space-y-4">{gap.competitorUrls.map(url=><li key={url} className="min-w-0 rounded-lg border border-[#e7e9db] bg-white p-3"><a href={url} target="_blank" rel="noreferrer noopener" className="block break-all text-xs text-[#456936] underline">{url}</a><CitationCapsuleModal domain={domain} buyerPrompt={gap.buyerPrompt} competitorUrl={url} /></li>)}</ul>
  </section>;
}
