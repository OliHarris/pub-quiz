import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: real browsers clicking through the real app, with the
 * game server and web app both running.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Starts both servers if they aren't already running (e.g. from `npm run dev`).
  webServer: [
    {
      command: "npm run dev -w @pub-quiz/server",
      cwd: "../..",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -w @pub-quiz/web",
      cwd: "../..",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
