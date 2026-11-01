import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true, channel: "chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 1 });
  await page.goto("https://citemend.vercel.app/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#preview-domain").fill("example.com");
  await page.getByRole("button", { name: "Preview my site" }).click();
  await page.getByRole("status").filter({ hasText: "Quick check for example.com" }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: "docs/launch-assets/preview-result.png" });
} finally {
  await browser.close();
}
