import { createAuditPostHandler } from "@/lib/audit-handler";

// Preserve the Day 1 setup check.
export async function GET() {
  return Response.json({ status: "ok", message: "CiteMind audit API placeholder" });
}

export const POST = createAuditPostHandler();