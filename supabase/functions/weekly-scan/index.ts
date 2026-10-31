declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const encoder = new TextEncoder();

async function matchesSecret(header: string | null, secret: string): Promise<boolean> {
  const expected = await crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${secret}`));
  const received = await crypto.subtle.digest("SHA-256", encoder.encode(header ?? ""));
  const a = new Uint8Array(expected), b = new Uint8Array(received);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  const secret = Deno.env.get("CRON_SECRET")?.trim();
  const appUrl = Deno.env.get("WEEKLY_SCAN_APP_URL")?.trim();
  if (!secret || !appUrl) return Response.json({ error: "Weekly scan relay is not configured." }, { status: 503 });
  if (!await matchesSecret(request.headers.get("authorization"), secret)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1024) return Response.json({ error: "Invalid request." }, { status: 413 });
  let action: unknown;
  try { action = (await request.json()).action; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (action !== "start" && action !== "drain") return Response.json({ error: "Invalid request." }, { status: 400 });

  try {
    const origin = new URL(appUrl);
    if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("Invalid app URL");
    const response = await fetch(new URL("/api/cron/weekly-scan", origin), {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return Response.json({ error: "Weekly scan request was not accepted." }, { status: 502 });
    return Response.json({ accepted: true });
  } catch {
    return Response.json({ error: "Weekly scan request could not be delivered." }, { status: 502 });
  }
});

export {};
