import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import Groq from "groq-sdk";

export type PitchKind = "competitor_direct_404" | "listicle_outbound_404" | "listicle_missing_brand" | "reddit_citation_thread";
export type PitchContext = { opportunityId: string; kind: PitchKind; domain: string; prompt: string; targetUrl: string; deadUrl: string | null; matchedUrl: string | null };
const pitchSchema = { type: "object", additionalProperties: false, properties: { draft: { type: "string" } }, required: ["draft"] };

export function buildPitchInstructions(context: PitchContext): string {
  const brand = context.domain.split(".")[0].replace(/[-_]/g, " ");
  if (context.kind === "competitor_direct_404" || context.kind === "listicle_outbound_404") return `Write a concise, courteous editor email. Mention the dead URL exactly (${context.deadUrl ?? ""}) in their AI-cited article (${context.targetUrl}) and suggest the working replacement (${context.matchedUrl ?? ""}). Do not claim independent validation beyond supplied data.`;
  if (context.kind === "listicle_missing_brand") return `Write a polite editor inclusion pitch for the article ${context.targetUrl}. Explain why ${brand} may fit the buyer request “${context.prompt}”. Do not invent product features; ask the editor to review the site.`;
  return `Write an authentic, non-spammy, disclosure-compliant founder comment directly answering the question in ${context.targetUrl} (“${context.prompt}”). Start exactly with “Hey, I'm the builder of ${brand}...” and disclose affiliation. Avoid pretending to be an unaffiliated user or making unsupported claims.`;
}

function validateDraft(value: unknown): string {
  const data = typeof value === "string" ? JSON.parse(value) : value;
  if (!data || typeof data !== "object" || typeof (data as { draft?: unknown }).draft !== "string") throw new Error("The AI returned an invalid outreach draft.");
  const draft = (data as { draft: string }).draft.trim();
  if (draft.length < 30 || draft.length > 4000) throw new Error("The AI returned an outreach draft with an invalid length.");
  return draft;
}

export async function generateHijackPitch(context: PitchContext, generator?: (prompt: string, signal: AbortSignal) => Promise<unknown>): Promise<string> {
  const prompt = buildPitchInstructions(context);
  const signal = AbortSignal.timeout(30000);
  if (generator) return validateDraft(await generator(prompt, signal));
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    try {
      const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 25000, retryOptions: { attempts: 1 } } });
      const response = await ai.models.generateContent({ model: "gemini-3.8-flash", contents: prompt, config: { responseMimeType: "application/json", responseJsonSchema: pitchSchema, maxOutputTokens: 1000, temperature: 0.45, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, abortSignal: signal } });
      return validateDraft(response.text ?? "");
    } catch (error) { if (signal.aborted) throw error; }
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Outreach drafting is not configured.");
  const groq = new Groq({ apiKey, timeout: 25000, maxRetries: 0 });
  const response = await groq.chat.completions.create({ model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b", messages: [{ role: "system", content: "Write accurate and respectful outreach. Never invent facts or conceal affiliation. Return only JSON with a string property draft." }, { role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.45, max_completion_tokens: 1000 });
  return validateDraft(response.choices[0]?.message?.content ?? "");
}

