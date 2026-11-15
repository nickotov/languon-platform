# Evidence: contextual exercise discovery

Status: Complete
Updated: 2026-11-15

## Acceptance evidence

| Acceptance | Verified proof                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1–AC3    | Final interactive-workbooks browser suite: six tests, no skips. Includes slash/menu discovery, Custom single/set authoring, preview checking with Send enabled and zero turn requests/console errors, query/scroll/focus restoration, mobile/desktop views and explicit AI preparation preserving prose.              |
| AC4        | Final changed web unit selection: 13 files, 69 tests passed. Real Tiptap interaction tests cover atomic chips, arrows/deletion, undo/redo, IME, Enter/ShiftEnter, disabled context and plain-text/unprivileged clipboard. Browser validates exact sent typed ranges and IDs, insert/save/reload and historical chips. |
| AC5        | Contracts focused 46 tests; real PostgreSQL/production-composition conversation group 486 tests, no skips. Migration defaults, history, idempotency, retry and source authority covered. Security review found no material issue.                                                                                     |
| AC6        | Focused backend 68 tests and guarded fixture 14 tests; mixed-content browser success plus advanced-selection/source replacement tests. Default one/type, explicit count conflicts, source/identity constraints and explanatory queries retain intended semantics.                                                     |
| AC7        | Web/backend production builds and completed typechecks, scoped lint/format/styles, current user-flow mappings and source-reviewed diagram atlas. Source and rendered reviews approved; final evidence approval recorded in REVIEW.md.                                                                                 |

## Final browser reports

All selected flows passed without retries/skips. The assertions were retained;
retired UI locators were updated to real replacement controls.

| Run under test-results/critical-flows/ | Selection                                                  | Passed |
| -------------------------------------- | ---------------------------------------------------------- | ------ |
| 1f9f6705-2a08-49cc-af13-8b734c7a8619   | interactive-workbooks; knowledge-intent-content-generation | 6 + 1  |
| dd77397e-c33e-44d6-be14-bc98b281b0e5   | knowledge-document-formatting; chat-lifecycle              | 1 + 1  |
| cdb403f9-7774-4cff-b30c-f01630e6ff87   | knowledge-reference-context-budget                         | 1      |
| fe90e602-d734-4389-af77-7808b1d6e592   | workbook-guide against final shared corpus entry           | 3      |
| 3778a1d4-0ed1-446b-9be5-f96df31e5332   | ai-conversation real PostgreSQL/production fake HTTP       | 486    |

Commands: `pnpm test:e2e:critical -- --flow <selection>`, using the listed reviewed
registry IDs. Browser runs use deterministic assistant fixtures, disposable
infrastructure and real application routes. No paid providers. Final guards clean
up their infrastructure. Earlier failed/incomplete reports remain as raw history.

## Static/build/unit commands

- `pnpm --filter @languon/web build`: final exit0, including TypeScript/static routes;
  /tmp/languon-discovery-web-final-preserved.log.
- `pnpm --filter @languon/backend build`: JS/declarations exit0;
  /tmp/languon-discovery-backend-build-final.log.
- Final backend `typecheck` exit0 after fixture changes:
  /tmp/languon-discovery-backend-complete-types.log. Final web build includes the
  latest source typecheck; direct preservation typecheck also exited0.
- Web Vitest changed 13-file selection: 69/69 passed,8.97s;
  /tmp/languon-discovery-unit-final-all.log. Separate guide corpus/content checks
  passed16 tests after the server-safe entrypoint extraction.
- Focused backend/contracts/fixture checks: logs
  /tmp/discovery-backend-remediation-tests.log,
  /tmp/discovery-mixed-dependency-fixture.log. Existing PG/production proof remains
  valid for unchanged persistence after helper/fixture-only refinements.
- Scoped ESLint across all changed web/backend/contracts TS files, Prettier,
  `pnpm --filter @languon/web styles:check`, `git diff --check`,
  `pnpm docs:user-flows:check` and `pnpm diagrams:check`: final results below.
- Migration classification/release workflow tests:11 passed. Canonical reviewed
  migration hash updated; classification reaches the pre-existing contract-release
  blocker rather than hash mismatch. Deployment readiness is not asserted.

## Review and corrected regressions

REVIEW.md records independent source/security/rendered findings and dispositions.
Corrections include selected-block preservation, manual set reachability, atomic
undo, preview portal/submit isolation, picker focus/search, exact advanced chip
synchronization, deleted-source blocking and atomic prompt-pair clearing during
in-flight admission. Actual UI/delayed-submit regressions cover these repairs.

The ordinary mixed-content fixture predated Feature069 and lacked the canonical
producer dependency/word coverage. Its corrected test uses actual production
authoring with validated predecessor IDs; production requirements were not relaxed.
Only generated corpus imports use the dedicated server-safe public examples entry;
interactive entity exports remain available to client consumers.

## Local readiness and limitations

The doctor initially reported one pending migration. Reviewed0171 only adds
conversation_messages.prompt_mentions JSONB NOT NULL DEFAULT []; canonical
`pnpm db:migrate` exited0 against the intended local development database. No
content deletion or env changes. Post-migration doctor exited0, ready:true:
/tmp/languon-discovery-doctor-migrated.json. This is configuration readiness only,
not live provider proof. No paid generation was authorized or attempted.

Designer inspected en/light1440×1000 picker/composer/preview and390×844 picker/
preview from final run1f9f6705. No material issue; optional chip-icon wrapping is
accepted as cosmetic. Dark/localized/error/open OS-keyboard states were not
visually inspected. Existing dark/narrow guide browser assertions pass separately.
Generated Next declarations and unrelated diagram date stamps were restored.

## Final static exits

All changed TS files passed scoped ESLint in web/backend/contracts (exit0 each).
All changed authored TS/TSX/CSS/MD/MJS passed Prettier (exit0). Styling contract,
`git diff --check`, all36user-flow guides/mappings and all diagram freshness/
Mermaid checks pass. Logs: /tmp/languon-discovery-static-final-*.log,
/tmp/languon-discovery-format-complete.log,
/tmp/languon-discovery-docs-complete.log,
/tmp/languon-discovery-diagrams-complete.log.

Final backend typecheck after all fixture changes exited0:
/tmp/languon-discovery-backend-complete-types.log. Final production web build and
all13selected browser journeys passed against the stabilized implementation.
No required implementation gate remains open; independent evidence approval is
granted in REVIEW.md before local delivery merge.
