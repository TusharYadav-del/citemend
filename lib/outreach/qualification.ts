import type { CitationState, Qualification } from "./types";
import type { EmailStatus } from "./email-verification";

export function scoreProspect(input: { companyFit: boolean; decisionMaker: boolean; aiPresence: boolean; citationStates: CitationState[]; technicalSeo: boolean; contactStatus: EmailStatus; personalizationEvidence: boolean }): Qualification {
  const broken = input.citationStates.some(state => state === "404" || state === "410");
  const components = { companyFit: input.companyFit ? 20 : 0, decisionMaker: input.decisionMaker ? 15 : 0, aiPresence: input.aiPresence ? 15 : 0, brokenCitation: broken ? 25 : 0, technicalSeo: input.technicalSeo ? 10 : 0, verifiedContact: input.contactStatus === "verified" ? 10 : 0, personalization: input.personalizationEvidence ? 5 : 0 };
  const score = Object.values(components).reduce((sum, value) => sum + value, 0);
  const reasons = [!input.companyFit && "company fit evidence missing", !input.decisionMaker && "decision-maker evidence missing", !input.aiPresence && "AI presence evidence missing", !broken && "no verified 404/410 citation", input.contactStatus !== "verified" && "contact is not verified", !input.personalizationEvidence && "personalization evidence missing"].filter((value): value is string => Boolean(value));
  return { score, components, eligible: score >= 75 && input.contactStatus === "verified" && input.companyFit && input.decisionMaker && broken, reasons };
}
