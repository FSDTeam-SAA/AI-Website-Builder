import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://localhost:4310",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/fixtures/website-builder-server.js",
      cwd: "../backendKoraAi",
      url: "http://127.0.0.1:4311/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command:
        "node --no-experimental-webstorage node_modules/next/dist/bin/next dev --port 4310",
      url: "http://localhost:4310/website-builder",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        KORA_BROWSER_TEST: "1",
        KORA_BACKEND_URL: "http://127.0.0.1:4311/api/v1",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      },
    },
  ],
});
