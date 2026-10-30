import { expect, test, type Page } from "@playwright/test";

const report = {
  domain: "example.com", buyerPrompt: "Find pricing", generatedText: "Sample answer with citations.", groundingMetadata: null,
  auditId: "00000000-0000-4000-8000-000000000006", createdAt: "2026-10-30T00:00:00Z", status: "partial",
  sitemapUrlCount: 24, extractedUrls: [], warnings: ["One status check timed out."],
  searchGrounding: { status: "available", sources: [] },
  findings: [
    { url: "https://example.com/old-pricing", httpStatus: 404, suggestedRedirect: "https://example.com/pricing", error: null },
    { url: "https://example.com/retired", httpStatus: 404, suggestedRedirect: null, error: null },
    { url: "https://example.com/docs", httpStatus: 200, suggestedRedirect: null, error: null },
    { url: "https://example.com/slow", httpStatus: null, suggestedRedirect: null, error: "Timeout" },
  ],
};
async function fill(page: Page) {
  await page.getByLabel("Your website domain").fill("https://example.com/");
  await page.getByLabel("Sample buyer prompt").fill("  Find pricing  ");
}

test("landing is responsive and has no fabricated score before an audit", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Catch Dead AI Links Before They Kill Your Organic Traffic.");
  await expect(page.getByTestId("health-score")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run AI Audit", exact: true })).toBeEnabled();
  await page.screenshot({ path: "test-results/day6-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Run AI Audit", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/day6-mobile.png", fullPage: true });
});

test("submits normalized input, displays real results, and copies the 301 rule", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let submitted: unknown;
  await page.route("**/api/audit", async (route) => { submitted = route.request().postDataJSON(); await route.fulfill({ status: 201, json: report }); });
  await page.goto("/"); await fill(page);
  await page.getByRole("button", { name: "Run AI Audit", exact: true }).click();
  await expect(page.getByTestId("health-score")).toHaveText("33/ 100");
  expect(submitted).toEqual({ domain: "example.com", buyerPrompt: "Find pricing" });
  await expect(page.getByText("1 URL check(s) are unresolved and excluded from the health score.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy 301 Rule for https://example.com/retired", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Copy 301 Rule for https://example.com/old-pricing", exact: true }).click();
  await expect(page.getByText("Copied!", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Redirect 301 "/old-pricing" "https://example.com/pricing"');
  await page.screenshot({ path: "test-results/day6-results.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("loading prevents duplicate audits and failures are shown without a stale report", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/audit", async (route) => { await gate; await route.fulfill({ status: 429, json: { error: "Provider rate limit. Please try again later." } }); });
  await page.goto("/"); await fill(page);
  await page.getByRole("button", { name: "Run AI Audit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Running your audit...", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Your website domain")).toBeDisabled();
  release();
  await expect(page.locator("main").getByRole("alert")).toContainText("Provider rate limit");
  await expect(page.getByTestId("health-score")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run AI Audit", exact: true })).toBeEnabled();
});

test("empty and unknown checks are not reported as perfect citation health", async ({ page }) => {
  await page.route("**/api/audit", (route) => route.fulfill({ status: 201, json: { ...report, findings: [], warnings: [] } }));
  await page.goto("/"); await fill(page);
  await page.getByRole("button", { name: "Run AI Audit", exact: true }).click();
  await expect(page.getByTestId("health-score")).toHaveText("—");
  await expect(page.getByText("No citations matching your domain were found.", { exact: false })).toBeVisible();
});

test("healthy reports show the no-404 state and invalid domains do not submit", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/audit", (route) => { requests++; return route.fulfill({ status: 201, json: { ...report, status: "completed", warnings: [], findings: [report.findings[2]] } }); });
  await page.goto("/");
  await page.getByLabel("Your website domain").fill("example.com/a-page");
  await page.getByRole("button", { name: "Run AI Audit", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Enter a domain");
  expect(requests).toBe(0);
  await fill(page);
  await page.getByRole("button", { name: "Run AI Audit", exact: true }).click();
  await expect(page.getByTestId("health-score")).toHaveText("100/ 100");
  await expect(page.getByText("No confirmed 404s in this audit", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});
