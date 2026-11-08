import "server-only";
import { createServerDatabase } from "../supabase-server";
import { discoverProspects, deduplicateProspects } from "./discovery";
import { researchCompany } from "./company-research";
import { verifyContactEmail } from "./email-verification";
import { scoreProspect } from "./qualification";
import { isSuppressed } from "./suppression";
import { checkOutreachCompliance } from "./compliance";
import { generateEvidenceBackedEmail, validateFactualityReport } from "./email-generation";
import { sendOutreachEmail } from "./sending";

const db = () => createServerDatabase();
const dateKey = () => new Date().toISOString().slice(0, 10);
function settingEnabled(row: { outreach_enabled:boolean; outreach_enabled_override:boolean|null; kill_switch:boolean } | null | undefined) { const enabled = row?.outreach_enabled_override ?? (row?.outreach_enabled === true || process.env.OUTREACH_ENABLED?.toLowerCase() === "true"); return enabled && row?.kill_switch !== true; }

export async function runDailyOutreach() {
  const database = db(); const runDate = dateKey();
    const { data: claim, error: claimError } = await database.rpc("outreach_begin_daily_run", { p_run_date: runDate });
  if (claimError) throw new Error("Could not acquire the daily outreach run lock.");
  const run = Array.isArray(claim) ? claim[0] : claim;
  if (!run?.claimed) return { status: "duplicate", runId: run?.run_id ?? null };
  let discovered = 0, researched = 0, qualified = 0, emailsSent = 0, errors = 0;
  try {
    const { data: settings, error: settingsError } = await database.from("outreach_settings").select("*").eq("id", 1).single();
    if (settingsError) throw new Error("Outreach settings are unavailable.");
    const prospects = deduplicateProspects(await discoverProspects(Math.min(20, settings.daily_target)));
    discovered = prospects.length;
    const campaign = await database.from("outreach_campaigns").select("id,status").eq("status", "active").limit(1).maybeSingle();
    for (const prospect of prospects) {
      try {
        const { data: saved, error: saveError } = await database.from("outreach_prospects").upsert({ domain: prospect.domain, company_name: prospect.companyName, category: prospect.category, country: prospect.country, website_url: prospect.websiteUrl, status: "discovered", report_public: true, research_json: { source_url: prospect.sourceUrl, excerpt: prospect.excerpt } }, { onConflict: "domain" }).select("id").single();
        if (saveError || !saved) throw saveError ?? new Error("Prospect persistence failed.");
        const research = await researchCompany(prospect); researched++;
        const evidenceRows = [
          ...(research.answerText ? [{ prospect_id: saved.id, evidence_type: "ai_answer", source_url: null, title: research.answerProvider, excerpt: research.answerText, observed_state: null, http_status: null, final_url: null, verification_json: { provider: research.answerProvider, sources: research.answerSources, warnings: research.answerWarnings }, verified_at: new Date().toISOString() }] : []),
          ...research.citationEvidence.map(item => ({ prospect_id: saved.id, evidence_type: "ai_answer_citation", source_url: item.url, title: research.answerProvider, excerpt: item.excerpt, observed_state: item.state, http_status: item.httpStatus, final_url: item.finalUrl ?? null, verification_json: { ...item, search_source_url: item.sourceUrl }, verified_at: new Date().toISOString() })),
        ];
        if (evidenceRows.length) await database.from("outreach_evidence").upsert(evidenceRows, { onConflict: "prospect_id,evidence_type,source_url" });
        const contactCheck = prospect.contact ? await verifyContactEmail(prospect.contact.email, { expectedDomain: prospect.domain }) : { status: "unknown" as const, normalized: "", domain: null, hasMx: null, role: false };
        let contactId: string | null = null;
        if (prospect.contact && contactCheck.status !== "invalid" && contactCheck.status !== "disposable") {
          const { data } = await database.from("outreach_contacts").upsert({ prospect_id: saved.id, email: contactCheck.normalized, full_name: prospect.contact.name ?? null, title: prospect.contact.title ?? null, email_status: contactCheck.status, verification_json: contactCheck, source_url: prospect.contact.sourceUrl, is_public: true }, { onConflict: "prospect_id,email" }).select("id").single(); contactId = data?.id ?? null;
        }
        const stateList = research.citationEvidence.map(item => item.state);
        const hasDecisionMaker = Boolean(prospect.contact?.name && prospect.contact?.title);
        const lower = `${prospect.excerpt} ${prospect.companyName}`.toLowerCase();
        const qualification = scoreProspect({ companyFit: /seo|agency|saas|ecommerce|commerce|marketing/i.test(`${prospect.category} ${lower}`), decisionMaker: hasDecisionMaker, aiPresence: /ai search|generative|geo|citation|llm/i.test(lower), citationStates: stateList, technicalSeo: /migration|redirect|technical seo|site migration/i.test(lower), contactStatus: contactCheck.status, personalizationEvidence: research.citationEvidence.some(item => item.state === "404" || item.state === "410") });
        await database.from("outreach_prospects").update({ status: qualification.eligible ? "qualified" : "researched", qualification_score: qualification.score, company_fit: qualification.components.companyFit, decision_maker_score: qualification.components.decisionMaker, ai_presence_score: qualification.components.aiPresence, broken_citation_score: qualification.components.brokenCitation, technical_seo_score: qualification.components.technicalSeo, verified_contact_score: qualification.components.verifiedContact, personalization_score: qualification.components.personalization, researched_at: new Date().toISOString(), research_json: { source_url: prospect.sourceUrl, excerpt: prospect.excerpt, qualification } }).eq("id", saved.id);
        if (!qualification.eligible || qualification.score < settings.min_qualification_score) continue;
        qualified++;
        const email = contactCheck.normalized;
        if (await isSuppressed(database, email)) { await database.from("outreach_prospects").update({ status: "suppressed" }).eq("id", saved.id); continue; }
        const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || "https://citemend.com").replace(/\/$/, "");
        const evidence = research.citationEvidence.filter(item => item.state === "404" || item.state === "410").flatMap(item => [
          { claim: `The generated ${research.answerProvider ?? "research"} answer for ${prospect.companyName} included this URL.`, sourceUrl: `${appOrigin}/report/${encodeURIComponent(prospect.domain)}`, quote: item.url, kind: item.state },
          { claim: `HTTP verification found ${item.state} for the cited URL.`, sourceUrl: item.url, quote: item.url, kind: item.state },
        ]);
        const message = generateEvidenceBackedEmail({ companyName: prospect.companyName, contactName: prospect.contact?.name, domain: prospect.domain, evidence, email, appOrigin });
        if (!message || !validateFactualityReport(message.factualityReport)) continue;
        const compliance = checkOutreachCompliance({ publicContact: true, contactSourceUrl: prospect.contact?.sourceUrl ?? null, emailStatus: contactCheck.status, score: qualification.score, minimumScore: settings.min_qualification_score, suppressed: false, reportExists: true, factualityPassed: message.factualityReport.passed, unsubscribeToken: message.text.match(/unsubscribe here: (\S+)/)?.[1] ?? "", country: prospect.country });
        if (!compliance.eligible || !settingEnabled(settings) || campaign.data?.status !== "active") continue;
        const reserved = await database.rpc("outreach_reserve_daily_send", { p_run_date: runDate, p_limit: settings.daily_send_limit });
        if (reserved.error || reserved.data !== true) break;
        const { data: savedEmail, error: emailSaveError } = await database.from("outreach_emails").insert({ prospect_id: saved.id, contact_id: contactId, campaign_id: campaign.data?.id ?? null, recipient: email, subject: message.subject, body_text: message.text, body_html: message.html, factuality_report: message.factualityReport, status: "queued" }).select("id").single();
        if (emailSaveError || !savedEmail) throw emailSaveError ?? new Error("Email draft persistence failed.");
        try {
          const sender = process.env.OUTREACH_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim();
          if (!sender) throw new Error("Configure OUTREACH_FROM_EMAIL before sending.");
          const delivery = await sendOutreachEmail({ idempotencyKey: savedEmail.id, to: email, from: sender, message });
          await database.from("outreach_emails").update({ provider: delivery.provider, provider_message_id: delivery.messageId, status: "sent", sent_at: new Date().toISOString() }).eq("id", savedEmail.id);
          await database.from("outreach_events").insert({ email_id: savedEmail.id, prospect_id: saved.id, event_type: "sent", payload: { provider: delivery.provider } });
          await database.from("outreach_prospects").update({ status: "sent" }).eq("id", saved.id); emailsSent++;
        } catch (error) { await database.from("outreach_emails").update({ status: "failed" }).eq("id", savedEmail.id); throw error; }
      } catch { errors++; }
    }
    await database.from("outreach_daily_runs").update({ status: "completed", finished_at: new Date().toISOString(), discovered, researched, qualified, emails_sent: emailsSent, errors, telemetry: { target: settings.daily_target, sendLimit: settings.daily_send_limit, outreachEnabled: settingEnabled(settings) } }).eq("id", run.run_id);
    return { status: "completed", runId: run.run_id, discovered, researched, qualified, emailsSent, errors };
  } catch (error) {
    await database.from("outreach_daily_runs").update({ status: "failed", finished_at: new Date().toISOString(), discovered, researched, qualified, emails_sent: emailsSent, errors: errors + 1, telemetry: { error: error instanceof Error ? error.message : "Unknown error" } }).eq("id", run.run_id);
    throw error;
  }
}
