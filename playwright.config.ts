import { defineConfig } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3108";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  workers: 1,
  use: { baseURL, viewport: { width: 1440, height: 1080 }, headless: true, channel: "chromium" },
  webServer: { command: `npm run dev -- --port ${new URL(baseURL).port || "3000"}`, url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
