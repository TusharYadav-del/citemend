// Exercises the development-only mock Server Actions. Never calls Gemini.
const baseUrl = process.argv.find((arg) => /^https?:\/\//.test(arg)) ?? "http://localhost:3000";
const shouldSave = process.argv.includes("--save");
const url = new URL("/dev/citation-probe", baseUrl);
const decode = (value) => value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
function readForm(html, save = false) {
  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
  const selected = save ? forms.find((match) => match[1].includes("Save mock audit")) : forms[0];
  if (!selected) throw new Error("Expected mock audit form was not found.");
  const form = new FormData();
  for (const input of selected[1].matchAll(/<input\b[^>]*>/g)) {
    if (!input[0].includes('type="hidden"')) continue;
    const name = input[0].match(/name="([^"]*)"/)?.[1];
    const value = input[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) form.append(decode(name), decode(value));
  }
  if (![...form.keys()].some((name) => name.startsWith("$ACTION_"))) throw new Error("No server-action fields found.");
  return form;
}
async function submit(form) {
  const response = await fetch(url, { method: "POST", body: form, headers: { Origin: url.origin } });
  const html = await response.text();
  const alert = html.match(/<p role="alert"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if (!response.ok || alert) throw new Error(alert ? decode(alert) : `HTTP ${response.status}`);
  return html;
}
const page = await fetch(url);
if (!page.ok) throw new Error(`Probe page returned HTTP ${page.status}. Start npm run dev first.`);
const form = readForm(await page.text());
form.set("domain", "example.com");
form.set("prompt", "Show the fixed mock documentation audit.");
const html = await submit(form);
const pre = html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/)?.[1];
if (!pre) throw new Error("No mock report JSON returned.");
const report = JSON.parse(decode(pre));
if (report.mode !== "mock" || report.groundingMetadata !== null || report.sources.length !== 3 || report.brokenLinks.length !== 2 || !report.brokenLinks.every((link) => link.httpStatus === 404)) throw new Error("Mock report does not match the fixture.");
const summary = { serverAction: "passed", mode: report.mode, citations: report.sources.length, simulated404s: report.brokenLinks.length, saved: false };
if (shouldSave) {
  const savedHtml = await submit(readForm(html, true));
  const id = savedHtml.match(/Audit ID: (?:<!-- -->)?([0-9a-f-]{36})/i)?.[1];
  if (!id || !savedHtml.includes("mock_completed") || !savedHtml.includes("Saved and read back from Supabase")) throw new Error("Database save/read-back was not confirmed.");
  summary.saved = true;
  summary.auditId = id;
}
console.log(JSON.stringify(summary, null, 2));
