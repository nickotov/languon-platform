import { describe, expect, it } from "vitest";

import { safeReturnPath } from "@/fsd/shared/lib/return-path";

describe("safeReturnPath", () => {
  it("keeps a same-origin relative path with query and fragment", () => {
    expect(safeReturnPath("/security?from=login#passkeys")).toBe(
      "/security?from=login#passkeys",
    );
  });

  it.each([
    undefined,
    ["/security", "/"],
    "",
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example",
    "/safe\nLocation:https://attacker.example",
  ])("rejects unsafe destination %s", (candidate) => {
    expect(safeReturnPath(candidate)).toBe("/");
  });
});
