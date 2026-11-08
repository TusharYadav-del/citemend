import { runFounderEmailDiagnostic } from "@/lib/founder-alerts";

export async function GET(request: Request) {
  const hostname = new URL(request.url).hostname;
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "::1"].includes(hostname)) return Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const diagnostic = await runFounderEmailDiagnostic();
  return Response.json(diagnostic, { headers: { "Cache-Control": "no-store" } });
}
