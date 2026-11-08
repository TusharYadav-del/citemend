import { runDailyOutreach } from "@/lib/outreach/scheduler";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "Cron is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try { return Response.json(await runDailyOutreach(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Daily outreach run failed." }, { status: 500 }); }
}
// Vercel Cron invokes GET; Supabase pg_cron uses the same authenticated handler.
export const GET = POST;
