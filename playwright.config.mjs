// Browser tests against a Node server with an empty, throw-away database.
import { defineConfig, devices } from "@playwright/test";

const port = 3998;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.mjs",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", locale: "tr-TR" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } }, grepInvert: /@phone/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: "node scripts/test-server.mjs",
    url: `http://localhost:${port}/health`,
    reuseExistingServer: false,
    env: { PORT: String(port) },
    timeout: 60_000,
  },
});
