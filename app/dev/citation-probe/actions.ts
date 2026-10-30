"use server";

import { createMockAudit, type MockAudit } from "@/lib/mock-audit";
import { saveMockAudit, type SavedMockAudit } from "@/lib/mock-audit-store";

export type ProbeState = { result: MockAudit | null; saved: SavedMockAudit | null; error: string | null };

export async function probeCitationAction(_previousState: ProbeState, formData: FormData): Promise<ProbeState> {
  if (process.env.NODE_ENV !== "development") return { result: null, saved: null, error: "This setup demo is available only in development." };
  let report: MockAudit | null = null;
  try {
    const domain = formData.get("domain");
    const prompt = formData.get("prompt");
    if (typeof domain !== "string" || typeof prompt !== "string") throw new Error("Domain and prompt are required.");
    // Regenerate findings from the fixture, never from client-supplied findings.
    report = createMockAudit(domain, prompt);
    const saved = formData.get("intent") === "save" ? await saveMockAudit(report) : null;
    return { result: report, saved, error: null };
  } catch (error) {
    return { result: report, saved: null, error: error instanceof Error ? error.message : "The mock audit could not complete." };
  }
}
