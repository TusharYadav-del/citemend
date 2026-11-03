import Link from "next/link";
import { Check, Circle, ArrowRight } from "lucide-react";

export type OnboardingProgress = {
  firstAudit: boolean;
  redirects: boolean;
  llmsAndCapsule: boolean;
  recovery: boolean;
};

const steps = [
  { key: "firstAudit", title: "Run your first 5-prompt AI Citation & 404 Audit", detail: "Start with a saved audit in your workspace.", href: "/#audit", action: "Run an audit" },
  { key: "redirects", title: "Export 301 Redirects or Sync with Shopify", detail: "Prepare a verified redirect for your site.", href: "#redirect-export", action: "View redirect tools" },
  { key: "llmsAndCapsule", title: "Generate your llms.txt & First Citation Capsule", detail: "Create crawler guidance and review citation opportunities.", href: "#llms-heading", action: "Generate llms.txt" },
  { key: "recovery", title: "Install the 1-Line Real-Time 404 Recovery Pixel (or Slack Webhook)", detail: "Connect recovery tools for one of your domains.", href: "/dashboard/pixel", action: "Set up recovery" },
] as const;

export default function OnboardingChecklist({ progress }: { progress: OnboardingProgress }) {
  const completed = steps.filter((step) => progress[step.key]).length;
  return (
    <section aria-labelledby="onboarding-title" className="mb-8 rounded-2xl border border-[#dce6d4] bg-gradient-to-br from-[#f7faF3] to-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#53704e]">YOUR FIRST 3 MINUTES</p><h2 id="onboarding-title" className="mt-2 text-xl font-semibold text-[#182c25]">Get your workspace set up</h2><p className="mt-1 text-sm text-[#68736b]">Complete these steps to get more from Citemend.</p></div>
        <p className="rounded-full border border-[#dce5d5] bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-[#36583f]">{completed}/4 complete</p>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e8eee3]" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed}>
        <div className="h-full rounded-full bg-[#5d844c] transition-[width] duration-500" style={{ width: `${completed * 25}%` }} />
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {steps.map((step) => {
          const done = progress[step.key];
          return <li key={step.key} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3.5 ${done ? "border-[#dce8d5] bg-[#f3f8ef]" : "border-[#e7ebe3] bg-white"}`}>
            <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-[#dcebd4] text-[#315b36]" : "bg-[#f0f2ed] text-[#929b91]"}`} aria-label={done ? "Completed" : "Not completed"}>{done ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}</span>
            <div className="min-w-0 flex-1"><h3 className={`text-sm font-semibold leading-5 ${done ? "text-[#35533a]" : "text-[#24352d]"}`}>{step.title}</h3><p className="mt-1 text-xs leading-5 text-[#748077]">{step.detail}</p><Link href={step.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#456936] hover:underline">{done ? "View" : step.action}<ArrowRight className="size-3" aria-hidden="true" /></Link></div>
          </li>;
        })}
      </ol>
    </section>
  );
}
