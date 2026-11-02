import { auth } from "@clerk/nextjs/server";
import { PromptSuggestionError, suggestBuyerPrompts } from "@/lib/prompt-suggestions";

export const maxDuration = 20;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Sign in to generate buyer prompts." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 2048) return Response.json({ error: "Request body is too large." }, { status: 413 });
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Provide a JSON object containing a domain." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Provide a JSON object containing a domain." }, { status: 400 });
    const result = await suggestBuyerPrompts((body as Record<string, unknown>).domain);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PromptSuggestionError ? error.status : 500;
    const message = error instanceof PromptSuggestionError ? error.message : "Prompt generation is temporarily unavailable.";
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
