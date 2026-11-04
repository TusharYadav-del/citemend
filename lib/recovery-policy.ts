export type RecoveryApprovalStatus = "pending_review" | "approved" | "deployed" | "rolled_back" | "rejected" | string;

export function canAutoRedirect(input: { urlState: string; httpStatus: number; approvalStatus: RecoveryApprovalStatus; similarityPercent: number | null }): boolean {
  return input.urlState === "404" && input.httpStatus === 404
    && (input.approvalStatus === "approved" || input.approvalStatus === "deployed")
    && input.similarityPercent !== null && input.similarityPercent >= 70 && input.similarityPercent <= 100;
}

/** An unscored lexical candidate may be deployed only after an explicit HTTP 200 review. */
export function canDeployApproved(input: { urlState: string; httpStatus: number; approvalStatus: RecoveryApprovalStatus; similarityPercent: number | null }): boolean {
  return input.urlState === "404" && input.httpStatus === 404
    && (input.approvalStatus === "approved" || input.approvalStatus === "deployed")
    && (input.similarityPercent === null || input.similarityPercent >= 70 && input.similarityPercent <= 100);
}

export async function verifyRedirectDestinations<T extends { destination: string }>(rules: T[], verify: (url: string) => Promise<{ state: string; httpStatus: number | null }>) {
  const live = new Set<number>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, rules.length) }, async () => {
    while (cursor < rules.length) {
      const index = cursor++;
      try {
        const result = await verify(rules[index].destination);
        if (result.state === "200" && result.httpStatus === 200) live.add(index);
      } catch { /* An unavailable verifier is not proof the URL is live. */ }
    }
  }));
  return { live: rules.filter((_, index) => live.has(index)), skipped: rules.filter((_, index) => !live.has(index)) };
}
