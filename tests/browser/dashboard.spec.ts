import { expect, test, type Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydration|hydrated.*match/i.test(message.text())) errors.push(message.text());
  });
});
test.afterEach(({ page }) => expect(browserErrors.get(page)).toEqual([]));

test("public landing shows the sign-in gate without a fabricated audit score", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find broken AI citations. Repair the destination. Verify the result.");
  await expect(page.getByLabel("Domain for free preview")).toBeVisible();
  await expect(page.getByTestId("health-score")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in to run your audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in or create an account" })).toBeVisible();
  await expect(page.getByLabel("Your website domain")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run AI Audit", exact: true })).toHaveCount(0);
});

test("interactive recovery preview and four-tier pricing avoid internal cost disclosures", async ({ page }) => {
  await page.goto("/");
  const preview = page.getByRole("region", { name: "Interactive Recovery Center preview" });
  await expect(preview.getByText("INTERACTIVE SAMPLE", { exact: false })).toBeVisible();
  expect((await preview.boundingBox())?.y).toBeLessThan(400);
  await preview.getByRole("tab", { name: "Broken-Source Outreach" }).click();
  await expect(preview.getByText("CiteMend cannot redirect a competitor domain.", { exact: false })).toBeVisible();
  await preview.getByRole("tab", { name: "Fix stale AI pricing claim" }).click();
  await expect(preview.getByText("A 301 is not appropriate for a live pricing page.", { exact: false })).toBeVisible();
  const pricing = page.locator("#pricing");
  for (const tier of ["Free Diagnostic", "Paid Pilot / Starter", "Agency & Growth", "Custom / Enterprise"]) await expect(pricing.getByRole("heading", { name: tier })).toBeVisible();
  await expect(pricing.getByText("$49/mo · ₹3,999/mo")).toBeVisible();
  await expect(pricing.getByText("$249/mo · ₹19,999/mo")).toBeVisible();
  await expect(pricing.getByText("Contact for Quote")).toBeVisible();
  await expect(pricing.getByText(/margin|exchange-rate|planning range/i)).toHaveCount(0);
});

test("free preview shows real check types and hands the domain to the protected audit", async ({ page }) => {
  await page.route("**/api/preview", async (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ domain: "example.com", homepageStatus: 200, sitemapStatus: 404, previewOnly: true }),
  }));
  await page.goto("/");
  await page.getByLabel("Domain for free preview").fill("example.com");
  await page.getByRole("button", { name: "Preview my site" }).click();
  await expect(page.getByText("Quick check for example.com")).toBeVisible();
  await expect(page.getByText("Homepage: Reachable · HTTP 200")).toBeVisible();
  await expect(page.getByText("Default sitemap: Needs review · HTTP 404")).toBeVisible();
  await page.getByRole("link", { name: "Continue to the full AI audit" }).click();
  await expect(page).toHaveURL(/#audit$/);
  await expect(page.getByRole("heading", { name: "Sign in to run your audit" })).toBeVisible();
});

test("mobile landing fits the hero and pricing across narrow phone widths", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}px`).toBe(true);
    const heroBounds = await heading.boundingBox();
    expect(heroBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((heroBounds?.x ?? 0) + (heroBounds?.width ?? width)).toBeLessThanOrEqual(width + 1);
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    for (const tier of ["Free Diagnostic", "Paid Pilot / Starter", "Agency & Growth", "Custom / Enterprise"]) await expect(page.locator("#pricing").getByRole("heading", { name: tier })).toBeVisible();
  }
});

test("the dashboard redirects anonymous visitors to Clerk sign-in", async ({ request }) => {
  const response = await request.get("/dashboard", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(/\/sign-in\?/);
  expect(response.headers().location).toContain("dashboard");
});

test("anonymous audit creation is rejected before any saved report is produced", async ({ request }) => {
  const response = await request.post("/api/audit", { data: { domain: "example.com", buyerPrompt: "Find pricing" } });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: expect.any(String) });
});

test("anonymous 301 export and Pro checkout are rejected", async ({ request }) => {
  const redirect = await request.post("/api/redirect-export", { data: { domain: "example.com", links: [], format: "htaccess" } });
  expect(redirect.status()).toBe(401);
  const checkout = await request.post("/api/lemonsqueezy/checkout");
  expect(checkout.status()).toBe(401);
});

test("weekly cron still requires its private bearer token", async ({ request }) => {
  const response = await request.get("/api/cron/weekly-scan");
  expect(response.status()).toBe(401);
});


test("anonymous capsule generation is rejected",async({request})=>{
  const response=await request.post("/api/capsule",{data:{domain:"example.com",buyerPrompt:"Compare pricing",competitorUrl:"https://competitor.test/pricing"}});
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({code:"SIGN_IN_REQUIRED"});
});
