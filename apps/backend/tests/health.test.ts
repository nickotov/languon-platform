import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";

describe("health endpoint", () => {
  it("reports that the backend is ready", async () => {
    const response = await createApp().request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "backend",
      status: "ok",
    });
  });

  it("publishes the health operation in OpenAPI", async () => {
    const response = await createApp().request("/openapi.json");
    const document = (await response.json()) as {
      paths?: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty("/health");
  });
});
