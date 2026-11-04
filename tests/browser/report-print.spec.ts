import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("agency report print styles preserve report content and generate a PDF", async ({ page }) => {
  const brand = execFileSync(process.execPath, ["--require", "./scripts/test-userinfo-fallback.cjs", "--import", "tsx", "tests/helpers/render-agency-report.tsx"], { encoding: "utf8", timeout: 15_000 });
  const styles = readFileSync("app/globals.css", "utf8");
  await page.route("https://agency.example/**", route => route.abort());
  await page.setContent(`<html><head><style>${styles}</style></head><body><main style="background:#07090e"><div class="audit-report"><div class="audit-report-content">${brand}<section aria-label="Audit summary"><p>Share of Model 50%</p></section><section><h2>Broken citations</h2><table class="report-print-only"><tr><td>https://client.example/old</td><td>https://client.example/new</td></tr></table></section><section><h2>Multi-Engine Citation Matrix</h2><article>ChatGPT Search: cited</article></section><section><h2>Competitor 404 hijack targets</h2><div class="overflow-x-auto"><table><tr><td>competitor.example/old</td></tr></table></div></section></div></div></main></body></html>`);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Apex & Partners").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Export Report/ })).toBeHidden();
  await expect(page.getByText("https://client.example/old")).toBeVisible();
  await expect(page.getByText("Multi-Engine Citation Matrix")).toBeVisible();
  await expect(page.getByText("competitor.example/old")).toBeVisible();
  expect(await page.locator("main").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1000);
});
