import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { loadEnvironment } from "./config/environment";

const localEnvironmentFile = new URL("../../../.env.local", import.meta.url);

if (existsSync(localEnvironmentFile)) {
  loadEnvFile(localEnvironmentFile);
}

const environment = loadEnvironment();
const app = createApp();
const server = serve(
  {
    fetch: app.fetch,
    port: environment.BACKEND_PORT,
  },
  ({ port }) => {
    console.log(`Languon backend listening on http://localhost:${port}`);
  },
);

function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
