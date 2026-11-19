import { createAuditPostHandler } from "@/lib/audit-handler";

export async function GET() {
  return Response.json({ error: "Use POST /api/audit to run an audit" }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}

// Allow bounded sitemap embedding and live candidate verification to finish on Vercel.
export const maxDuration = 60;

export const POST = createAuditPostHandler();
