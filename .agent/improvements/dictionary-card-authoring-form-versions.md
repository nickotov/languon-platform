# Improvement: Dictionary card authoring form versions

Status: Complete
Created: 2026-09-28
Updated: 2026-09-28

## Routing decision

- Intended outcome: keep every successful AI regeneration as a locally reviewable
  version of the complete dictionary-card form, while correcting dependent Example
  translation presentation and the suggestion-action alignment.
- Why this is an improvement rather than a correction: this adds a focused version
  navigation interaction to the established inline card-authoring experience without
  adding a new journey or changing its server contract.
- Explicit-feature check: the user explicitly requested an improvement, not a feature
  or full feature lifecycle.
- Feature boundaries checked: no new product capability or journey, public contract,
  persistence, security/auth policy, production dependency, deployment, migration,
  or ADR-worthy architecture decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit feature
  authorization before crossing any feature boundary.

## Context and scope

- Current behavior: successor proposals replace the one proposal visible in the form;
  users cannot return to the preceding complete form state, and regenerated Example
  content can leave its translated UI state appearing unchanged.
- Expected behavior: every successful regeneration of all fields or one field creates
  a new local whole-form version. Footer arrows and a counter switch versions without
  a request. Regenerating Context example presents its newly generated Example
  translation in that new version.
- In scope: local authoring state/version snapshots, footer controls, exact
  suggestion-action alignment, localization, focused component/E2E coverage, the
  mapped dictionary-platform guide, and real-browser verification.
- Out of scope: persisted draft history, a new API or schema, branching the server
  predecessor chain from a historical version, and changing accept/save semantics.
- Likely files/surfaces: `apps/web/src/fsd/features/dictionary-card-authoring/**`,
  web i18n messages/tests, and the dictionary-platform guide/mapped journey.
- Relevant ADRs or constraints: ADR-0016 requires real-browser verification;
  historical suggestion IDs remain valid because successor proposals retain prior
  choices, while new generation stays restricted to the latest version.
- Related user-flow guides: `docs/user-flows/dictionary-platform.md`.
- Rollback/removal path: remove local version snapshots and footer navigation; no
  stored data rollback is required.

## Acceptance criteria

- AC-1 — A successful successor regeneration of all fields or one field appends one
  whole-form UI version and automatically displays it; the initial generation remains
  version 1.
- AC-2 — Previous/next footer controls and a current/total counter switch complete
  local draft/review states without a network request, with disabled end controls and
  accessible localized names.
- AC-3 — Regenerating Context example displays both the new Example and new Example
  translation in the new version, while the preceding version remains recoverable.
- AC-4 — Save uses the displayed version, Discard retains its existing whole-draft
  behavior, and regeneration is available only from the newest version.
- AC-5 — Suggestion action rows use `justify-content: flex-start` and an 8 px gap.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Implement the focused improvement.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation and mapped E2E traceability.
- [x] Verify the visible behavior in a real browser.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                 |
| ------------------------ | ---------------------- |
| Tests                    | Pass — focused 51/51, full web 239/239, mapped Playwright 1/1 |
| Lint/typecheck/build     | Pass — web lint, typecheck, and production build |
| Runtime/browser/database | Pass — managed Chrome desktop/mobile against disposable PostgreSQL/Redis; schema unchanged |
| Documentation/user-flow  | Pass — guide validation and mapped revision check |

## Outcome and evidence

- Changes made: card-authoring state now retains complete local draft, proposal,
  accepted-selection, rejected-selection, and reviewed-selection snapshots for
  every successful successor regeneration. The newest version opens
  automatically; localized previous/next controls and a counter switch versions
  in the footer without requests. Historical versions remain reviewable and
  saveable while generation controls are disabled. Context example regeneration
  presents the matching new Example translation. Suggestion actions now align
  from the start with an 8 px gap.
- Commands and results:
    - `pnpm --filter @languon/web exec vitest run tests/dictionary-card-authoring.test.tsx`
      — pass, 51/51, including complete form-state switching and dependent Example
      translation regression coverage.
    - `pnpm --filter @languon/web test` — pass, 32 files / 239 tests.
    - `pnpm --filter @languon/web lint`, `typecheck`, and `build` — pass.
    - Focused mapped Playwright journey `creates a mixed card from replacement
      inline AI field reviews` — pass, 1/1 in Chromium using deterministic AI and
      task-owned PostgreSQL/Redis. It verifies whole-form version navigation plus
      the existing 320 px / 200% text overflow check. Containers were removed.
    - `pnpm docs:user-flows:check` and
      `pnpm user-flow:e2e -- check dictionary-platform` — pass.
    - `pnpm browser:check` — pass, 9 wrapper tests and the real headless launch.
      Managed Chrome 152 session
      `languon-card-form-versions-2adb04f81439865e0f39130bff3658a3`
      verified a saved-card Context example regeneration at desktop and 320×900:
      both dependent suggestions advanced to `alternative 1`, the footer reported
      `Version 2 of 2`, the previous arrow restored both original suggestions and
      disabled all regeneration controls, and the next arrow restored the newest
      form. Page errors were empty; console output contained only development/HMR
      messages. Network requests were local and successful after the expected
      unauthenticated pre-login refresh 401. Mobile screenshot:
      `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1790612677530.png`.
      The browser session and local services were closed.
    - `git diff --check` — pass.
- Documentation: updated the inline authoring guide, mapped scenario assertions,
  and user-flow revision marker.
- Review: initial independent review covered the complete implementation and
  documentation diff from base `1ae10f18857276407a8c116fef82a2347d02ed11`
  (captured tracked patch SHA-256
  `5d561709353dd6ccdd41332fbf130c0c429eaa511399afbf0b2873c44e145c45` plus
  the three recorded untracked files). It traced proposal transitions, failure
  cleanup, version-local edits/selections, historical saving, latest-only
  regeneration, responsive controls, and mapped evidence. No material findings
  or verification gaps remained.

## Remaining risks

- No known material risks. Versions intentionally live only for the open form;
  closing or discarding the draft removes them, and generation remains constrained
  to the newest server predecessor.
