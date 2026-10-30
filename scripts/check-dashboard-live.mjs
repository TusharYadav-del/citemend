import { chromium } from "@playwright/test";
const baseUrl = process.argv[2] ?? "http://localhost:3108";
const domain = process.argv[3] ?? "stripe.com";
const browser = await chromium.launch({ headless: true, channel: "chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await page.getByLabel("Your website domain").fill(domain);
  await page.getByLabel("Sample buyer prompt").fill(`Find the official ${domain} pricing and getting-started documentation and cite their URLs.`);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/audit") && response.request().method() === "POST", { timeout: 180_000 });
  await page.getByRole("button", { name: "Run AI Audit", exact: true }).click();
  const response = await responsePromise;
  const report = await response.json();
  if (response.status() !== 201) throw new Error(report.error ?? `HTTP ${response.status()}`);
  await page.getByTestId("health-score").waitFor();
  await page.screenshot({ path: "test-results/day6-live.png", fullPage: true });
  if (errors.length) throw new Error(errors.join("; "));
  console.log(JSON.stringify({ httpStatus: response.status(), auditId: report.auditId, domain: report.domain, status: report.status, checkedCitations: report.findings.length, confirmed404s: report.findings.filter((finding) => finding.httpStatus === 404).length, displayedHealth: await page.getByTestId("health-score").innerText(), sitemapUrls: report.sitemapUrlCount, warnings: report.warnings }, null, 2));
} finally { await browser.close(); }
