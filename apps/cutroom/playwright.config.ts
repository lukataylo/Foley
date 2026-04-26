import { defineConfig, devices } from "@playwright/test";

// Slim Playwright config — one project (chromium), one test directory,
// runs against an already-running dev server on http://localhost:3000.
// We DO NOT have Playwright spin up its own server because the smoke suite
// already manages the dev server lifecycle externally and reusing the
// running instance keeps boot time off the test budget.

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
