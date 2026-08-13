import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    // Database integration files intentionally share one explicitly disposable
    // database. Keep files serialized so one suite cannot reset it beneath
    // another; individual tests still exercise deliberate concurrency.
    fileParallelism: false,
  },
});
