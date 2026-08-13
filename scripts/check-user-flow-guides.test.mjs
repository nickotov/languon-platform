import assert from "node:assert/strict";
import test from "node:test";

import { parseFrontmatter, validateGuide } from "./check-user-flow-guides.mjs";

const validGuide = `---
feature: example-feature
title: Example Feature
status: current
last_verified: 2026-08-13
surfaces:
  - browser
  - api
source_paths:
  - apps/web/src/example/**
related_features:
  - shared-example
---

# Example Feature

## What this verifies

Scope.

## Start the development environment

Start it.

## Browser verification

Use a browser.

## API verification

Call the API.

## Expected failure and edge cases

Check failures.

## Automated regression checks

Run tests.

## Troubleshooting

Inspect errors.

## Cleanup

Stop it.
`;

test("accepts a complete indexed guide", () => {
  assert.doesNotThrow(() =>
    validateGuide(
      validGuide,
      "example-feature.md",
      "- [Example Feature](./example-feature.md)",
    ),
  );
});

test("parses scalar and list frontmatter", () => {
  const { metadata } = parseFrontmatter(validGuide, "example-feature.md");

  assert.equal(metadata.get("feature"), "example-feature");
  assert.deepEqual(metadata.get("surfaces"), ["browser", "api"]);
});

test("rejects filename and feature mismatches", () => {
  assert.throws(
    () =>
      validateGuide(
        validGuide,
        "different-feature.md",
        "- [Example Feature](./different-feature.md)",
      ),
    /filename must match feature slug/,
  );
});

test("rejects missing surface sections", () => {
  assert.throws(
    () =>
      validateGuide(
        validGuide.replace("## API verification", "## HTTP examples"),
        "example-feature.md",
        "- [Example Feature](./example-feature.md)",
      ),
    /missing required '## API verification'/,
  );
});

test("rejects empty list items and empty required sections", () => {
  assert.throws(
    () =>
      validateGuide(
        validGuide.replace("  - apps/web/src/example/**", "  -    "),
        "example-feature.md",
        "- [Example Feature](./example-feature.md)",
      ),
    /'source_paths' must be a non-empty list/,
  );
  assert.throws(
    () =>
      validateGuide(
        validGuide.replace("## Cleanup\n\nStop it.", "## Cleanup\n"),
        "example-feature.md",
        "- [Example Feature](./example-feature.md)",
      ),
    /required '## Cleanup' section is empty/,
  );
  assert.throws(
    () =>
      validateGuide(
        validGuide.replace(
          "## Cleanup\n\nStop it.",
          "## Cleanup\n\n<!-- later -->\n\n```sh\n```",
        ),
        "example-feature.md",
        "- [Example Feature](./example-feature.md)",
      ),
    /required '## Cleanup' section is empty/,
  );
});

test("rejects unsafe source paths and missing index entries", () => {
  assert.throws(
    () =>
      validateGuide(
        validGuide.replace(
          "apps/web/src/example/**",
          "../outside-repository/**",
        ),
        "example-feature.md",
        "- [Example Feature](./example-feature.md)",
      ),
    /must be repository-relative/,
  );
  assert.throws(
    () => validateGuide(validGuide, "example-feature.md", "# Empty index"),
    /guide is missing from README.md index/,
  );
});

test("does not count a fenced example as an index entry", () => {
  assert.throws(
    () =>
      validateGuide(
        validGuide,
        "example-feature.md",
        "```md\n- [Example Feature](./example-feature.md)\n```",
      ),
    /guide is missing from README.md index/,
  );
  assert.throws(
    () =>
      validateGuide(
        validGuide,
        "example-feature.md",
        "<!-- [Example Feature](./example-feature.md) -->\n`[Example Feature](./example-feature.md)`",
      ),
    /guide is missing from README.md index/,
  );
});
