import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const baseUrl = process.argv[2] ?? "http://localhost:3108";
const domains = ["nextjs.org", "stripe.com", "vercel.com", "supabase.com", "github.com"];
await mkdir("docs", { recursive: true });
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const results = [];
try {
  for (const domain of domains) {
    const started = Date.now();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    let result;
    try {
      await page.goto(baseUrl);
      await page.getByLabel("Your website domain").fill(domain);
      await page.getByLabel("Sample buyer prompt").fill(`Find the official ${domain} pricing or getting-started documentation. Cite up to three relevant full URLs.`);
      const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/audit") && response.request().method() === "POST", { timeout: 180_000 });
      await page.getByRole("button", { name: "Run AI Audit", exact: true }).click();
      const response = await responsePromise;
      const report = await response.json();
      if (response.status() === 201) await page.getByTestId("health-score").waitFor();
      else await page.locator("main").getByRole("alert").waitFor();
      result = { domain, httpStatus: response.status(), auditId: report.auditId ?? null, status: report.status ?? "failed", provider: report.providerUsed ?? null, searchStatus: report.searchGrounding?.status ?? null, checkedCitations: report.findings?.length ?? 0, confirmed404s: report.findings?.filter((finding) => finding.httpStatus === 404).length ?? 0, unresolvedChecks: report.findings?.filter((finding) => finding.httpStatus === null).length ?? 0, sitemapUrls: report.sitemapUrlCount ?? 0, warnings: report.warnings ?? [], error: report.error ?? null, frontendState: response.status() === 201 ? "report" : "error", browserErrors };
      await page.screenshot({ path: `test-results/week1-${domain}.png`, fullPage: true });
    } catch (error) {
      result = { domain, status: "test_failed", error: error.message, browserErrors };
    } finally { await page.close(); }
    result.durationSeconds = Math.round((Date.now() - started) / 1000);
    results.push(result);
    console.log(JSON.stringify(result));
    await writeFile("docs/week1-live-results.json", JSON.stringify({ testedDate: "2026-10-31", flow: "dashboard -> live Groq/Tavily -> sitemap/HTTP -> Supabase -> dashboard", results }, null, 2) + "\n");
  }
} finally { await browser.close(); }
if (results.some((result) => result.httpStatus !== 201 || result.browserErrors.length)) process.exitCode = 1;
