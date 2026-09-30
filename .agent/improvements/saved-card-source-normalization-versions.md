# Improvement: Saved card Source normalization and versions

Status: Complete
Created: 2026-09-30
Updated: 2026-09-30

## Routing decision

- Intended outcome: AI generation on a persisted card normalizes mandatory noun
  articles reliably and always preserves the pre-generation form as version 1.
- Why this is an improvement rather than a correction: it strengthens the
  established Source-normalization contract and extends existing local form
  history to the first saved-card generation without adding a new journey.
- Explicit-feature check: the user did not request a feature or the full feature
  lifecycle.
- Feature boundaries checked: no public contract, persistence, permission,
  dependency, deployment, migration, or ADR-worthy architecture change.
- Escalation rule: stop, mark this record `Escalated`, and request explicit
  feature authorization before crossing any feature boundary.

## Context and scope

- Current behavior: a model can return French bare noun `but` as unchanged even
  though the prompt requires gender signaling. Separately, local form history is
  appended only when a proposal already exists, so the first AI generation for
  a saved card replaces the sole UI version.
- Expected behavior: French `but` normalizes to `le but`; ambiguous spellings are
  interpreted using the trusted Source language. Generating any field on a saved
  card creates version 2 while version 1 retains the exact pre-generation form.
- In scope: prompt instruction/tests, saved-card draft-version state, component
  tests, and the mapped saved-card browser journey.
- Out of scope: a language lexicon, deterministic morphology, persisted form
  version history, or API/database changes.
- Relevant constraints: form versions remain local UI state; the first saved-card
  job remains an initial update request, not a predecessor regeneration.
- Related user-flow guide: `docs/user-flows/dictionary-platform.md`.
- Rollback/removal path: revert prompt clauses and local version-state changes;
  no stored-data cleanup is required.

## Acceptance criteria

- AC-1 — Prompt instructions explicitly require French `but` to become `le but`
  and forbid using another language’s interpretation when the trusted Source
  language identifies a gendered noun.
- AC-2 — The first generation of any field on a persisted card creates local
  version 2 while version 1 retains the pre-generation draft.
- AC-3 — Later regenerations continue appending versions and historical versions
  remain non-generatable and switchable.
- AC-4 — Initial saved-card generation still enqueues an update job with no
  predecessor; only the local form-history behavior changes.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Add failing prompt and component regression coverage.
- [x] Tighten Source normalization and saved-card version initialization.
- [x] Update the mapped guide/E2E journey.
- [x] Run focused, affected static/build, and browser verification.
- [x] Review the final diff and close evidence.

## Verification

| Check                    | Result                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                    | Pass — web card-authoring tests (57), full web unit suite (247), prompt tests (5), and the focused Chromium saved-card journey. The new prompt and component regressions failed before implementation and passed afterward.                                                                                               |
| Lint/typecheck/build     | Pass — web lint, typecheck, and production build; prompts lint, typecheck, and build; backend typecheck and build; final focused checks repeated after formatting.                                                                                                                                                        |
| Runtime/browser/database | Pass — agent-browser at 1280×720 verified first saved-card generation opens `Version 2 of 2`, version 1 preserves the original fields and disables generation, and returning to version 2 restores AI review. No browser errors or failed authenticated requests. Disposable PostgreSQL and Redis were stopped afterward. |
| Documentation/user-flow  | Pass — the dictionary-platform guide and mapped E2E revision are synchronized; `pnpm docs:user-flows:check` and `pnpm user-flow:e2e -- check dictionary-platform` pass.                                                                                                                                                   |

## Outcome and evidence

- Changes made: strengthened the checked-in authoring prompt so ambiguous tokens
  are interpreted in the trusted field language and explicitly require French
  `but` to normalize to `le but`. Saved-card generation now reserves a new local
  form version even when no proposal exists yet, while the API request remains
  an initial update (`successor: false`). Restored saved proposals initialize as
  version 2, and subsequent regenerations continue appending versions.
- Commands and results: `pnpm --filter @languon/web exec vitest run
tests/dictionary-card-authoring.test.tsx`, `pnpm --filter @languon/prompts test
-- local-prompts.test.ts`, the full web unit suite, affected lint/typecheck/build
  commands, the focused Playwright Chromium journey, user-flow checks, Prettier,
  and `git diff --check` all passed.
- Documentation: updated `docs/user-flows/dictionary-platform.md` and its mapped
  E2E scenario/revision marker to cover trusted-language noun normalization and
  version 1/version 2 navigation after first generation on a saved card.
- Review: final diff review found no material correctness, contract, persistence,
  or security issue. The generation API still distinguishes initial updates from
  successor jobs. `use-card-authoring.ts` was already over the 250-line review
  threshold; the new orchestration is seven focused lines, while the reusable
  version-state construction was extracted into `card-draft-versions.ts` and
  `use-card-draft.ts` remains below the threshold.

## Remaining risks

- Article and gender normalization remains model-mediated rather than backed by a
  deterministic morphology lexicon. The prompt now makes the behavior mandatory
  and covers the reported ambiguity explicitly, but an external provider can
  still violate instructions; existing recoverable generation handling applies.
- Form version history remains intentionally local to the open editor and is not
  persisted across closing or reloading the card.
