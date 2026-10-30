import { ApiError } from "@google/genai";
import { AuditInputError, runAudit } from "@/lib/audit-pipeline";
import { AuditStorageError } from "@/lib/audit-store";



// Preserve the Day 1 setup check.
export async function GET() {
  return Response.json({ status: "ok", message: "CiteMind audit API placeholder" });
}

export async function POST(request: Request) {
  // Authentication is not implemented yet. Never expose admin-backed writes publicly.
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Audit POST is development-only until authentication is implemented." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Use Content-Type: application/json." }, { status: 415 });
  let input: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 16_384) return Response.json({ error: "Request body exceeds 16 KiB." }, { status: 413 });
    input = JSON.parse(body);
  } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  try {
    return Response.json(await runAudit(input), { status: 201 });
  } catch (error) {
    if (error instanceof AuditInputError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AuditStorageError) return Response.json({ error: error.message, stage: "persistence" }, { status: 502 });
    if (error instanceof ApiError) return Response.json({ error: "Gemini could not complete the grounded request. No audit was saved.", stage: "gemini", upstreamStatus: error.status }, { status: error.status === 429 ? 429 : 502 });
    return Response.json({ error: "The audit could not complete. Check server configuration and provider availability.", stage: "pipeline" }, { status: 502 });
  }
}
