import "server-only";
import fixture from "./fixtures/mock-audit.json";

export function createMockAudit(domain: string, prompt: string) {
  const hostname = domain.trim().toLowerCase();
  if (!hostname || hostname.length > 253 || !/^[a-z0-9.-]+$/.test(hostname)) {
    throw new Error("Enter a hostname only, such as example.com.");
  }
  const url = new URL(`https://${hostname}`);
  if (url.hostname !== hostname || !hostname.includes(".") || hostname.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    throw new Error("Enter a valid hostname, such as example.com.");
  }
  if (!prompt.trim() || prompt.length > 4000) {
    throw new Error("Enter a prompt of up to 4000 characters.");
  }
  const sources = fixture.sources.map(({ index, path, title }) => ({ index, url: new URL(path, url).href, title }));
  return {
    mode: "mock" as const,
    previewId: crypto.randomUUID(),
    domain: hostname,
    prompt: prompt.trim(),
    text: fixture.text,
    sources,
    citations: fixture.citations,
    groundingMetadata: null,
    brokenLinks: fixture.brokenLinks.map((link) => ({
      citedUrl: new URL(link.path, url).href,
      httpStatus: link.httpStatus,
      suggestedRedirect: new URL(link.redirectPath, url).href,
    })),
  };
}

export type MockAudit = ReturnType<typeof createMockAudit>;
