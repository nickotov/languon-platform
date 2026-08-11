import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HealthResponseSchema } from "@languon/contracts";

const route = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
      description: "The API process is ready to receive traffic.",
    },
  },
  tags: ["Operations"],
});

export const healthRoutes = new OpenAPIHono().openapi(route, (context) =>
  context.json(
    {
      service: "backend",
      status: "ok",
    },
    200,
  ),
);
