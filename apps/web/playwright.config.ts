import { defineConfig, devices } from "@playwright/test";

const webOrigin = process.env.AUTH_E2E_WEB_ORIGIN ?? "http://localhost:3333";
const backendOrigin =
  process.env.AUTH_E2E_BACKEND_ORIGIN ?? "http://localhost:4000";
const databaseUrl = process.env.AUTH_E2E_DATABASE_URL;
const redisUrl = process.env.AUTH_E2E_REDIS_URL;

if (!databaseUrl || !redisUrl) {
  throw new Error(
    "AUTH_E2E_DATABASE_URL and AUTH_E2E_REDIS_URL must point to disposable local test services.",
  );
}

if (!/(?:e2e|test)/i.test(new URL(databaseUrl).pathname)) {
  throw new Error(
    "AUTH_E2E_DATABASE_URL must name a dedicated database containing 'e2e' or 'test'.",
  );
}

for (const [name, value] of [
  ["AUTH_E2E_WEB_ORIGIN", webOrigin],
  ["AUTH_E2E_BACKEND_ORIGIN", backendOrigin],
  ["AUTH_E2E_DATABASE_URL", databaseUrl],
  ["AUTH_E2E_REDIS_URL", redisUrl],
] as const) {
  const hostname = new URL(value).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(`${name} must point to a loopback service for safe E2E.`);
  }
}

const backendPort = new URL(backendOrigin).port || "4000";
const webPort = new URL(webOrigin).port || "3333";
const reuseExistingServer = process.env.AUTH_E2E_REUSE_SERVERS === "true";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: ".next/playwright/test-results",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["list"]],
  retries: process.env.CI ? 2 : 0,
  testDir: "./tests/e2e",
  timeout: 45_000,
  use: {
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @languon/backend db:migrate && pnpm --filter @languon/backend exec tsx src/index.ts",
      env: {
        APP_ENV: "development",
        AUTH_ALLOWED_ORIGINS: webOrigin,
        AUTH_CODE_HMAC_SECRET:
          "e2e-only-code-secret-do-not-use-outside-local-tests",
        AUTH_JWT_SECRET: "e2e-only-jwt-secret-do-not-use-outside-local-tests-1",
        AUTH_WEBAUTHN_RP_ID: new URL(webOrigin).hostname,
        BACKEND_PORT: backendPort,
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
      },
      reuseExistingServer,
      stderr: "pipe",
      stdout: "pipe",
      timeout: 120_000,
      url: `${backendOrigin}/health`,
    },
    {
      command: `pnpm exec next dev --turbopack -p ${webPort} -H 127.0.0.1`,
      env: { NEXT_PUBLIC_API_URL: backendOrigin },
      reuseExistingServer,
      stderr: "pipe",
      stdout: "pipe",
      timeout: 120_000,
      url: webOrigin,
    },
  ],
  workers: 1,
});
