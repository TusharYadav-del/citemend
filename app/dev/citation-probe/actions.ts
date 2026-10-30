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
      return { result: null, error: "Gemini quota is exhausted (HTTP 429). Check this key's project quota at https://ai.dev/rate-limit before retrying." };
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
