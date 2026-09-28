import { defineConfig } from "@playwright/test";

// Run against a dev server that's already running with seeded data:
//   npm run setup && npm run dev      (in one terminal)
//   npm run test:e2e                  (in another)
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3002",
    viewport: { width: 1400, height: 900 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
});
