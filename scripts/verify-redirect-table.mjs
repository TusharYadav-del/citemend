const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!base || !key) throw new Error("Configure the public Supabase URL and key.");

const headers = { apikey: key, Accept: "application/json" };
for (const [name, query, expected] of [
  ["active routing columns", "select=source_host,source_path,destination,active&limit=1", [200]],
  ["private owner column", "select=user_id&limit=1", [401, 403]],
]) {
  const response = await fetch(`${base}/rest/v1/redirect_rules?${query}`, {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  console.log(`${name}: HTTP ${response.status}`);
  if (!expected.includes(response.status)) process.exitCode = 1;
}
