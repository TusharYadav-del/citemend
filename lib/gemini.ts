import "server-only";
import { ApiError, GoogleGenAI, type GroundingMetadata } from "@google/genai";

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

  const ai = new GoogleGenAI({ apiKey, httpOptions: {
    timeout: 60000,
    retryOptions: { attempts: 2, httpStatusCodes: [503], initialDelay: 1, maxDelay: 2 },
  } });
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


export class UrlEmbeddingError extends Error {
  constructor(message: string, public readonly retryAfterMs?: number) { super(message); }
}
export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export function urlEmbeddingModel(): string {
  return process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";
}

/** Validate and normalize reduced-dimensional vectors before cosine search. */
export function normalizeUrlEmbedding(values: unknown): number[] {
  if (!Array.isArray(values) || values.length !== 768 || !values.every(value => typeof value === "number" && Number.isFinite(value))) {
    throw new UrlEmbeddingError("Expected a finite 768-dimensional URL embedding.");
  }
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm === 0) throw new UrlEmbeddingError("The URL embedding has no usable direction.");
  return values.map(value => value / norm);
}

/** A single bounded batch; Gemini returns one vector per text for this model. */
export async function generateUrlEmbeddings(texts: string[], task: EmbeddingTask = "RETRIEVAL_DOCUMENT", signal?: AbortSignal): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > 20 || texts.some(text => !text.trim() || text.length > 2000)) throw new UrlEmbeddingError("Embed 1 to 20 URL keyword strings of up to 2000 characters.");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new UrlEmbeddingError("URL embeddings are not configured.");
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 10_000, retryOptions: { attempts: 1 } } });
  try {
    const response = await ai.models.embedContent({
      model: urlEmbeddingModel(), contents: texts,
      config: { taskType: task, outputDimensionality: 768, abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) },
    });
    if (response.embeddings?.length !== texts.length) throw new UrlEmbeddingError("The embedding provider returned an incomplete batch.");
    return response.embeddings.map(embedding => normalizeUrlEmbedding(embedding.values));
  } catch (error) {
    if (error instanceof UrlEmbeddingError) throw error;
    if (error instanceof ApiError && error.status === 429) {
      throw new UrlEmbeddingError("URL embedding quota is temporarily exhausted. Cached batches are retained.", 60_000);
    }
    throw new UrlEmbeddingError("URL embeddings are temporarily unavailable. Existing redirect matching is still available.");
  }
}

export async function generateUrlEmbedding(text: string): Promise<number[]> {
  return (await generateUrlEmbeddings([text], "RETRIEVAL_QUERY"))[0];
}
