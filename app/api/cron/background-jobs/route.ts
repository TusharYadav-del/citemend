import { timingSafeEqual } from "node:crypto";
import { processNextBackgroundJob } from "@/lib/background-job-processor";

export const maxDuration = 300;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return json({ error: "Background worker is not configured." }, 503);
  if (!authorized(request.headers.get("authorization"), secret)) return json({ error: "Unauthorized." }, 401);
  try { return json(await processNextBackgroundJob()); }
  catch { return json({ error: "Background job queue is temporarily unavailable." }, 503); }
}

export const GET = run;
export const POST = run;
