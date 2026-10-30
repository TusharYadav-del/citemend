import "server-only";
import { GoogleGenAI, type GroundingMetadata } from "@google/genai";

export type CitationProbeResult = {
  text: string;
  groundingMetadata: GroundingMetadata | null;
  sources: { index: number; url: string; title: string }[];
  citations: { text: string; startIndex: number | null; endIndex: number | null; sourceIndices: number[] }[];
};

export class CitationProbeError extends Error {}

export async function runCitationProbe(
  domain: string,
  prompt: string,
): Promise<CitationProbeResult> {
  if (typeof domain !== "string" || !domain.trim() || domain.length > 253) {
    throw new CitationProbeError("Enter a domain of up to 253 characters.");
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    throw new CitationProbeError("Enter a prompt of up to 4000 characters.");
  }
  const url = new URL(`https://${domain.trim()}`);
  if (url.hostname !== domain.trim().toLowerCase() || !url.hostname.includes(".")) {
    throw new CitationProbeError("Enter a hostname only, such as example.com.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new CitationProbeError("Set GEMINI_API_KEY in .env.local and restart the development server.");
  }

  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60000 } });
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: `Research the domain ${url.hostname} using Google Search. Answer the following request with verifiable sources. Do not claim a URL was checked for HTTP errors.\n\n${prompt.trim()}`,
    config: { tools: [{ googleSearch: {} }] },
  });
  const text = response.text ?? "";
  if (!text.trim()) {
    throw new CitationProbeError("Gemini returned no text. Try a different prompt.");
  }
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata ?? null;
  const sources = (groundingMetadata?.groundingChunks ?? []).flatMap((chunk, index) =>
    chunk.web?.uri
      ? [{ index, url: chunk.web.uri, title: chunk.web.title ?? chunk.web.uri }]
      : [],
  );
  const citations = (groundingMetadata?.groundingSupports ?? []).map((support) => ({
    text: support.segment?.text ?? "",
    startIndex: support.segment?.startIndex ?? null,
    endIndex: support.segment?.endIndex ?? null,
    sourceIndices: support.groundingChunkIndices ?? [],
  }));

  return { text, groundingMetadata, sources, citations };
}
