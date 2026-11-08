import "server-only";
import { verifyUrl } from "../seo";
import type { CitationState } from "./types";

export async function verifyCitation(url: string, verifier = verifyUrl): Promise<{ state: CitationState; httpStatus: number | null; finalUrl?: string; error?: string }> {
  const result = await verifier(url);
  return { state: result.state, httpStatus: result.httpStatus, ...(result.finalUrl ? { finalUrl: result.finalUrl } : {}), ...(result.error ? { error: result.error } : {}) };
}
export function isVerifiedBroken(state: CitationState): boolean { return state === "404" || state === "410"; }
