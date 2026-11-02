import { createAuditPostHandler } from "@/lib/audit-handler";

// Preserve the Day 1 setup check.
export async function GET() {
  return Response.json({ status: "ok", message: "CiteMind audit API placeholder" });
}

// Allow bounded sitemap embedding and live candidate verification to finish on Vercel.
export const maxDuration = 300;

export const POST = createAuditPostHandler();
