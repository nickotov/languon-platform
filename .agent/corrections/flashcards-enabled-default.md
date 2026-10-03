# Correction: Enable implemented Cards by default

Status: Complete
Created: 2026-10-02
Updated: 2026-10-02

## Routing decision and scope

User-authorized configuration correction to the already delivered flashcard
feature: make the environment default and example true, retain explicit false
as the off switch. The user confirms no production deployment exists and asks
to remove the unnecessary default opt-in. No endpoint, permissions, persisted
schema, paid AI operation, dependency, or UI contract is added. This is not an
authorization to deploy anything. ADR-0024's default-off clause needs an explicit
partial successor; all migration, compatible writer, and purge constraints stay.

Preserve unrelated local-app startup repair record. Do not change ignored local
secrets or disable explicit user overrides. Local flag is absent, so the running
backend watcher can pick up the new default automatically.

## Acceptance criteria and plan

- AC-1: Omitted flag enables Cards; example configuration agrees.
- AC-2: Explicit false still disables it; malformed values remain rejected.
- AC-3: Running backend reports enabled, and the real browser exposes Cards.
- [x] Red/green environment regression; scoped lint/typecheck.
- [x] Update current instructions and document the superseded default policy.
- [x] Verify live capability and browser launcher; inspect focused final diff.

## Verification strategy

Environment unit tests cover defaults and overrides. Existing feature 034
evidence proves unchanged enabled/disabled launcher and session behavior.
Run targeted browser observation for actual default availability. No database
change or new session algorithm needs a repeated database/full journey matrix.
Update guide revisions only after checking mapped scenarios still match.

## Evidence, review, and remaining risks

Base: bb2d065; final source changes are the default parser value, sanitized
example, and five configuration regression cases. No frontend logic changes.
Tested SHA-256: parser
`775302e001be192be28463c645d64167acb4918ae65726b2588dc3f304f1f661`;
environment tests
`a4a2e27b0022c6f4f1ada69a237a0bbd51f56ab66c9a526923886d3f2ae415a8`.

- Red: `pnpm --filter @languon/backend test tests/unit/config/environment.test.ts`
  failed four default assertions before the parser change. Green: all 35 tests
  pass, including defaults in all four environments, explicit true/false, and
  invalid input rejection.
- `pnpm --filter @languon/backend typecheck` and scoped ESLint on environment
  parser/tests pass. Scoped Prettier and `git diff --check` pass.
- Live `GET /learning/capabilities` reports `{"flashcardsEnabled":true}` after
  the existing backend watcher restarted; no local environment override was
  added. User-owned services remain running.
- Project-pinned agent-browser through the safe wrapper, task session
  `languon-flashcards-default-311b1839ea55ddf4e0cf7423a0dbd919`, localhost web3333
  and API4000: synthetic signup/verification, empty dictionary, Train menu with
  Cards and disabled Sentences, Cards opens Train cards dialog with example-side
  defaults. Browser errors empty; console only development tooling/HMR messages.
  Learning capability/preferences/prepare requests succeeded. No paid AI calls.
- Synthetic account removal scheduled through the existing authenticated
  deletion API (HTTP 202, `deletion_scheduled`) after the profile dialog check;
  account is deactivated and its data follows the existing recoverable deletion
  and later purge policy. Browser session closed; no user data was removed.
- ADR-0025 partially supersedes only ADR-0024's default-off clause, with metadata
  relationship and index. Current architecture, plan rollout, and both guides
  reflect the new default. Historical checkpoints/evidence retain their original
  default-off state rather than rewriting past verification.
- `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check flashcard-training-web`,
  and `pnpm user-flow:e2e -- check flashcard-training-backend` pass. Existing
  mapped scenario assertions/fixtures are unchanged; revision markers reflect
  setup documentation only. Full mapped E2E was not rerun: feature033/034 enabled
  journey evidence remains valid because backend composed tests pass explicit
  enabled true and web Playwright sets the flag true. New default is independently
  covered by red/green configuration tests and actual default-config browser
  observation, not claimed as a new full E2E run.

Configuration-only correction does not warrant an independent review;
accepted ADR default-policy amendment is explicitly user authorized. Explicit
false in a process environment still takes precedence, intentionally. Existing
pre-activation migration/writer/purge prerequisites remain mandatory for future
deployment.
