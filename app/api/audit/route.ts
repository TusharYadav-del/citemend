import { CitationProviderError } from "@/lib/citation-probe";
import { AuditInputError, runAudit } from "@/lib/audit-pipeline";
import { AuditStorageError } from "@/lib/audit-store";
import { auth } from "@clerk/nextjs/server";



// Preserve the Day 1 setup check.
export async function GET() {
  return Response.json({ status: "ok", message: "CiteMind audit API placeholder" });
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return Response.json({ error: "Audit sign-in is not configured. Add the Clerk keys to the server environment." }, { status: 503 });
  }
  let userId: string | null;
  try { userId = (await auth()).userId; }
  catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503 }); }
  if (!userId) return Response.json({ error: "Sign in to run an audit." }, { status: 401 });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return Response.json({ error: "Use Content-Type: application/json." }, { status: 415 });
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "JSON body is required." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16_384) {
          await reader.cancel().catch(() => {});
          return Response.json({ error: "Request body exceeds 16 KiB." }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  try {
    const report = await runAudit(input);
    return Response.json(report, { status: report.persistence.status === "saved" ? 201 : 200 });
  } catch (error) {
    if (error instanceof AuditInputError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AuditStorageError) return Response.json({ error: error.message, stage: "persistence" }, { status: 502 });
    if (error instanceof CitationProviderError) return Response.json({ error: error.message, stage: "probe", provider: "groq", upstreamStatus: error.upstreamStatus }, { status: error.upstreamStatus === 429 ? 429 : 502 });
    return Response.json({ error: "The audit could not complete. Check server configuration and provider availability.", stage: "pipeline" }, { status: 502 });
  }
}
