// Run against npm run dev. Exercises the actual Next.js Server Action form.
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const url = new URL("/dev/citation-probe", baseUrl);
const decode = (value) => value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const page = await fetch(url);
if (!page.ok) throw new Error(`Probe page returned HTTP ${page.status}. Start npm run dev first.`);
const html = await page.text();
const form = new FormData();
for (const input of html.matchAll(/<input\b[^>]*>/g)) {
  if (!input[0].includes('type="hidden"')) continue;
  const name = input[0].match(/name="([^"]*)"/)?.[1];
  const value = input[0].match(/value="([^"]*)"/)?.[1] ?? "";
  if (name) form.append(decode(name), decode(value));
}
if (![...form.keys()].some((name) => name.startsWith("$ACTION_"))) {
  throw new Error("No server-action form fields found.");
}
form.set("domain", "nextjs.org");
form.set("prompt", "Use Google Search to find the official Next.js installation guide. Summarize its requirements with citations.");
const response = await fetch(url, { method: "POST", body: form, headers: { Origin: url.origin } });
const resultHtml = await response.text();
const alert = resultHtml.match(/<p role="alert">([\s\S]*?)<\/p>/)?.[1];
if (!response.ok || alert) {
  console.error(alert ? decode(alert) : `Server Action returned HTTP ${response.status}`);
  process.exitCode = 1;
} else {
  const pre = resultHtml.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  if (!pre) throw new Error("The Server Action did not return a probe result.");
  const result = JSON.parse(decode(pre));
  if (!result.text?.trim() || !result.groundingMetadata || !result.sources?.length || !result.citations?.length) {
    throw new Error("Gemini responded, but the probe did not return text, web sources, and citation segments.");
  }
  console.log(JSON.stringify({ serverAction: "passed", textLength: result.text.length, sources: result.sources.length, citationSegments: result.citations.length }, null, 2));
}
