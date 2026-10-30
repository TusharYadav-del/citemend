"use server";

import { ApiError } from "@google/genai";
import { CitationProbeError, runCitationProbe, type CitationProbeResult } from "@/lib/gemini";

export type ProbeState = { result: CitationProbeResult | null; error: string | null };

export async function probeCitationAction(
  _previousState: ProbeState,
  formData: FormData,
): Promise<ProbeState> {
  if (process.env.NODE_ENV !== "development") {
    return { result: null, error: "This setup probe is available only in development." };
  }
  const domain = formData.get("domain");
  const prompt = formData.get("prompt");
  if (typeof domain !== "string" || typeof prompt !== "string") {
    return { result: null, error: "Domain and prompt are required." };
  }
  try {
    return { result: await runCitationProbe(domain, prompt), error: null };
  } catch (error) {
    // Do not serialize provider responses, which may contain request details.
    if (error instanceof CitationProbeError) {
      return { result: null, error: error.message };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { result: null, error: "Google rejected the grounded Gemini 3.8 Flash request with HTTP 429. Check this API key's project, model-specific RPM/TPM/RPD limits, and Google Search grounding quota at https://ai.dev/rate-limit. This response does not identify which limit was hit." };
    }
    if (error instanceof ApiError && error.status === 503) {
      return { result: null, error: "Gemini 3.8 Flash is temporarily unavailable due to high demand (HTTP 503). Try again later." };
    }
    if (error instanceof ApiError) {
      return { result: null, error: `Gemini request failed (HTTP ${error.status}). Check the key, model access, and quota in AI Studio.` };
    }
    if (error instanceof TypeError) {
      return { result: null, error: "Check the hostname and network connection, then try again." };
    }
    return { result: null, error: "The probe could not complete. Check GEMINI_API_KEY, the domain and prompt, then try again." };
  }
}
