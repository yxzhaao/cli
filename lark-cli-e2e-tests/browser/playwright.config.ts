import { defineConfig } from "@playwright/test";

const artifactDir = process.env.ARTIFACT_DIR || "artifacts";
const headless = process.env.PLAYWRIGHT_HEADLESS !== "0";

export default defineConfig({
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  outputDir: `${artifactDir}/playwright-output`,
  testDir: ".",
  testMatch: ["auth.spec.ts"],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", headless },
    },
  ],
});
