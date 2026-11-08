import { createServerDatabase } from "@/lib/supabase-server";
import { verifyUnsubscribeToken } from "@/lib/outreach/suppression";
import { createHmac } from "node:crypto";
async function unsubscribe(request: Request) {
  const url = new URL(request.url); const token = url.searchParams.get("token") ?? (request.method === "POST" ? new URLSearchParams(await request.text()).get("token") : null);
  if (!token) return Response.json({ error: "Unsubscribe token is required." }, { status: 400 });
  const email = verifyUnsubscribeToken(token);
  if (!email) return Response.json({ error: "Unsubscribe link is invalid." }, { status: 400 });
  try {
    const db = createServerDatabase();
    const tokenHash = createHmac("sha256", process.env.OUTREACH_TOKEN_SECRET || process.env.CRON_SECRET || "").update(token).digest("hex");
    const { error } = await db.from("outreach_suppressions").upsert({ email, reason: "unsubscribe", source: "one_click", token_hash: tokenHash }, { onConflict: "email" });
    if (error) throw error;
    await db.from("outreach_emails").update({ status: "unsubscribed" }).eq("recipient", email).in("status", ["sent", "delivered"]);
    return request.method === "GET" ? new Response("You have been unsubscribed from CiteMend outreach.", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }) : Response.json({ unsubscribed: true });
  } catch { return Response.json({ error: "Unsubscribe could not be recorded." }, { status: 503 }); }
}
export const GET = unsubscribe;
export const POST = unsubscribe;
