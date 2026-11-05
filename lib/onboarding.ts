export type OnboardingProgress = { domainConnected: boolean; firstAudit: boolean; recoveryApproved: boolean; resultVerified: boolean };
export function getOnboardingProgress(input: { ownedDomains: number; savedAudit: boolean; approvedRecovery: boolean; technicalDeploymentVerified: boolean }): OnboardingProgress {
  return { domainConnected: input.ownedDomains > 0, firstAudit: input.savedAudit, recoveryApproved: input.approvedRecovery, resultVerified: input.technicalDeploymentVerified };
}

export const AUDIT_TEMPLATES = {
  "B2B SaaS Buyer-Intent Template": ["Best software for [buyer problem]", "[Product category] alternatives for growing teams", "Compare [product] pricing and features", "How to solve [buyer pain point] with software", "Recommended [product category] for [industry]"],
  "Multi-Client Agency Pitch Template": ["Best [client category] tools for [industry]", "Compare [client brand] with leading alternatives", "What does [client brand] cost?", "Recommended [client service] for [buyer type]", "How does [client brand] solve [buyer pain point]?"],
} as const;
