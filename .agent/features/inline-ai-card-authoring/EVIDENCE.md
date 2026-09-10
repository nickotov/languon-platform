# Verification evidence: Inline AI Card Authoring

Updated: 2026-09-10

## Automated tests

### Unit and contract

- `pnpm --filter @languon/contracts test`: 6 files, 52 tests passed, including
  four `card-authoring:v1` contract tests.
- `pnpm --filter @languon/prompts test`: 1 file, 5 tests passed, including the
  bounded plain-text card-authoring prompt.
- `pnpm --filter @languon/backend test`: 67 files/470 tests passed; 15 files/109
  guarded integration tests skipped in the ordinary no-infrastructure run.
- `pnpm --filter @languon/web test`: 21 files/131 tests passed. API transport,
  source-only generation, Unicode/control validation, progress/cancel,
  Accept/Discard, regeneration, Source staleness, provenance clearing, errors,
  language metadata, and responsive inert rendering are covered.
- `pnpm test:release-deployment`: 95 passed, 5 environment-gated skips. Explicit
  expand-before-activate, overlap, rollback, stop-enqueue, budgets, and inert
  defaults include `card-authoring:v1`.

### PostgreSQL integration

- Disposable target: PostgreSQL 17 on loopback port 55436, database
  `languon_auth_inline_ai_test`; the task-owned container was removed afterward.
- Guarded Vitest run for `dictionary-card-authoring-generation-store.test.ts`
  and `migrations.test.ts`: 2 files, 6 tests passed.
- Verified migration 0018 apply/repeatability; enqueue/claim/complete; immutable
  predecessor retention; cumulative discarded-value history across repeated,
  alternating, disabled, and re-enabled fields; mixed and manual atomic card plus
  revision creation; duplicate warning replay; legacy single-card acceptance;
  exact replay; redaction; migration locks.
- `pnpm --filter @languon/backend db:check`: passed.
- `node scripts/migration-classification.mjs`: `expand`, reviewed through
  generated migration `0018_long_lord_hawal`.
- No down migration exists. Rollback retains the expand-compatible schema; old
  slots ignore the nullable column and the CHECK retains older proposal shapes.

### Mapped E2E

- Scenario: `inline-ai-card-authoring-preserves-field-choices` in the canonical
  dictionary-platform mapped Playwright file.
- Fresh task-owned PostgreSQL 17/Redis 8, deterministic local worker, and no
  paid/live model: the mapped Chromium scenario passed before and after review
  remediation.
- Covered source-only generation, adjacent suggestions, field regeneration with
  prior choice retained, whole regeneration, discard without draft loss, manual
  Definition refinement, 320px/200% no overflow, atomic Save, and `Human + AI`.
- Both task-owned containers were removed after the run.

## Real application verification

- Storybook build passed.
- The project-pinned browser wrapper verified Add Card at 320x800: a long
  suggestion wrapped, all named actions were present, Accept filled only
  Translation while alternatives remained, and there were no runtime errors.
- Screenshot:
  `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1787750674762.png`.
- Console contained only Vite/React development notices; local requests were
  200/304 except the expected Storybook favicon 404.

## User-flow and design verification

- Updated the canonical dictionary guide with configuration, behavior, failure,
  accessibility, traceability, and cleanup; updated design-system guidance.
- `pnpm docs:user-flows:check`: 16/16 checker tests passed; 8 guides validated.
- `pnpm user-flow:e2e -- check dictionary-platform`: passed with revision
  `sha256:e88d848310a72c33`.

## Repository-wide checks

- `pnpm check`: passed after a clean rerun.
- This included Prettier, 17 agent-skill packages, web-dev-panel catalog,
  user-flow validation, full ESLint, all 10 workspace typechecks, root tests,
  and all 9 production builds.
- Web production build, backend declarations/bundle, admin build, mobile web
  export, contracts, prompts, and shared packages passed. Existing non-failing
  Vite chunk-size and React test `act` advisories are unrelated.

## Local startup note

- `pnpm dev:backend` loads root `.env.local`. The reported missing
  `DICTIONARY_HMAC_SECRET` means an older/missing local file lacks the now-required
  dedicated key. This checkout's `.env.local` contains it; `.env.example` is the
  sanitized source for fresh setup.

## Review

- Independent correctness review: approved after all regeneration,
  migration-compatibility, duplicate-warning, and atomic-cleanup findings were
  fixed; final focused rerun passed 28/28.
- Independent test audit: approved; independently confirmed contracts, prompts,
  web, guide/mapping, PostgreSQL, deployment, and diff checks.
- Security review: approved after requested-field-only provider projection and
  non-provider conflict accounting remediation; no material finding remains.

## Remaining risks

- Production AI remains inactive until a later compatible release advertises
  `card-authoring:v1` and approved live-provider privacy, credential, budget, and
  readiness gates pass.
- A draft lineage retains at most 24 distinct historical values per field;
  reaching that defensive bound returns a safe conflict and the user can start a
  fresh authoring request.
- Deliberately closing Add Card abandons local draft/selection state. The durable
  proposal expires server-side and is not auto-restored in this iteration.
