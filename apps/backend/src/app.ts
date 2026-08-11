import { OpenAPIHono } from "@hono/zod-openapi";

import { healthRoutes } from "./modules/health/interface/http/health.route";

export function createApp(): OpenAPIHono {
  const app = new OpenAPIHono();

  app.route("/", healthRoutes);
  app.doc("/openapi.json", {
    info: {
      description: "Public API for Languon applications.",
      title: "Languon API",
      version: "0.1.0",
    },
    openapi: "3.1.0",
  });

  return app;
}
