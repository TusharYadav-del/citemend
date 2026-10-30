import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  workers: 1,
  use: { baseURL: "http://localhost:3108", viewport: { width: 1440, height: 1080 }, headless: true, channel: "chromium" },
  webServer: { command: "npm run dev -- --port 3108", url: "http://localhost:3108", reuseExistingServer: true, timeout: 120_000 },
});
