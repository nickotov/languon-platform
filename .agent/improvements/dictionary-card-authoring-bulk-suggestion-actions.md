# Improvement: Dictionary card authoring bulk suggestion actions

Status: Complete
Created: 2026-09-25
Updated: 2026-09-25

## Routing decision

- Intended outcome: an author reviewing AI-generated card content can accept or discard all currently available field suggestions with one clear action.
- Why this is an improvement rather than a correction: this adds a focused convenience interaction to an existing card-authoring journey while preserving its API, persistence, suggestion, and save semantics.
- Explicit-feature check: the user did not request a feature or full feature lifecycle.
- Feature boundaries checked: no new product capability or journey, public contract, persistence, security/auth policy, production dependency, deployment, migration, or ADR-worthy architecture decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit feature authorization before crossing any feature boundary.

## Context and scope

- Current behavior: every generated field suggestion must be accepted or discarded separately.
- Expected behavior: a compact review action row appears when usable suggestions exist. **Accept all** selects the first available suggestion for each eligible field that does not already have an accepted choice. **Discard all** hides every currently available suggestion using the same non-destructive semantics as individual discard; field text remains unchanged. Individual actions remain available.
- In scope: card-authoring state actions, bulk-action composition and responsive styling, English/French messages, unit and mapped E2E coverage, guide updates, real-browser verification.
- Out of scope: backend contracts, saved-card AI review, batch/document generation, changing suggestion ordering, automatic save, or clearing field values on discard.
- Likely files/surfaces: `apps/web/src/fsd/features/dictionary-card-authoring/**`, web i18n messages, card-authoring tests, dictionary-platform guide and mapped E2E.
- Relevant ADRs or constraints: ADR-0016 requires real-browser evidence; ADR-0017 runtime tokens and shared UI primitives are authoritative. Existing Accept/Discard semantics remain authoritative.
- Related user-flow guides: `docs/user-flows/dictionary-platform.md`, scenario `inline-ai-card-authoring-preserves-field-choices`.
- Rollback/removal path: remove the bulk action component and hook methods; individual per-suggestion controls continue to provide the full existing workflow.

## Acceptance criteria

- AC-1 — **Accept all** accepts one available suggestion for every eligible field without replacing a field choice already accepted by the user.
- AC-2 — **Discard all** hides all available suggestions and clears their selected-attribution state without clearing field text.
- AC-3 — Bulk actions appear only with available suggestions, remain safe for stale/active states, use accessible labels and established controls, and fit narrow mobile layouts without horizontal overflow.
- AC-4 — Individual accept, discard, regeneration, manual editing, and final save behavior remain available and unchanged.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Implement the focused improvement.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation or record why none is needed.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                 |
| ------------------------ | ---------------------- |
| Tests                    | Pass: 212 web tests and mapped deterministic E2E |
| Lint/typecheck/build     | Pass: web lint, typecheck, and build |
| Runtime/browser/database | Pass: Storybook real-browser desktop/narrow states; database not applicable |
| Documentation/user-flow  | Pass: guide and mapped revision checks |

## Outcome and evidence

- Changes made: added a responsive bulk-review row to AI card authoring; centralized bulk selection/discard behavior in the authoring hook; preserved individual controls and non-destructive discard semantics; added all four locale messages and populated narrow/desktop stories. The Playwright harness now explicitly disables managed routing/credit enforcement and clears the live model ID so deterministic E2E cannot inherit paid-provider settings from `.env.local`.
- Commands and results:
  - `pnpm --filter @languon/web test` — pass, 27 files / 212 tests.
  - `pnpm --filter @languon/web lint` — pass.
  - `pnpm --filter @languon/web typecheck` — pass. An earlier parallel run raced `next build` while `.next` types were being replaced; the sequential rerun after build passed.
  - `pnpm --filter @languon/web build` — pass.
  - `pnpm --filter @languon/web test:e2e --grep "creates a mixed card from retained inline AI field choices"` with documented disposable PostgreSQL/Redis variables — pass, deterministic provider. Disposable containers were stopped and removed.
  - `pnpm docs:user-flows:check` and `pnpm user-flow:e2e -- check dictionary-platform` — pass.
  - Project-pinned browser session on the populated Storybook card-authoring stories — pass: desktop row and narrow stacked layout rendered; Accept all populated three fields, Discard all hid all suggestions without clearing values; final clean session reported no console or page errors. The mapped E2E also retained its 320px/200% overflow assertion.
  - `git diff --check` — pass. Final application/test/doc patch SHA-256: `3fc8d54e43fb86c2b7919e649e4d68e436766b10590bb0eb1babf99755ca74ef`, based on `411354af484067b926279078c20a1d310c4dbc23`.
- Documentation: updated the inline card-authoring guide and its mapped E2E revision marker with bulk-action behavior and narrow-layout expectations.
- Review: initial independent review found two low-severity gaps: count-dependent grammar in the summary and insufficient proof that bulk acceptance preserves an already selected alternative, plus missing stale/active button assertions. Remediation introduced count-neutral copy in all locales, selected the second translation in the preservation test, and added explicit stale/active coverage. Focused remediation review marked both findings resolved with no new material defects. Automated approval review rejected temporarily elevating a disposable browser account because it crossed an authorization boundary; verification used synthetic Storybook data and deterministic E2E instead.

## Remaining risks

- No known functional or visual risks. The bulk accept rule intentionally chooses the first available suggestion only for fields without an accepted choice; the review summary and tests make that behavior explicit.
