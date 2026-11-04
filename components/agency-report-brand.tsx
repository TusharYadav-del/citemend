import Image from "next/image";
import type { AgencyProfile } from "@/lib/agency-whitelabel";
import PrintReportButton from "./print-report-button";

export function AgencyReportBrand({ agency, autoPrint }: { agency: AgencyProfile | null; autoPrint: boolean }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5"><div className="flex items-center gap-3">{agency?.agency_logo_url && <Image unoptimized src={agency.agency_logo_url} alt={`${agency.agency_brand_name} logo`} width={160} height={56} className="h-14 w-auto max-w-40 object-contain" />}<p className="text-lg font-semibold text-white">{agency?.agency_brand_name ?? "Citation audit report"}</p></div><PrintReportButton autoPrint={autoPrint} /></div>;
}

export function AgencyReportCTA({ agency }: { agency: AgencyProfile | null }) {
  if (!agency?.agency_cta_url || !agency.agency_cta_text) return null;
  return <div className="report-cta sticky bottom-3 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-white" style={{ backgroundColor: agency.agency_primary_color }}><span className="font-semibold">{agency.agency_brand_name}</span><a href={agency.agency_cta_url} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900">{agency.agency_cta_text} →</a></div>;
}
