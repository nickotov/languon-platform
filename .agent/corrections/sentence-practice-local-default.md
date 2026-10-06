# Correction: Enable sentence practice by default locally

Status: Complete
Created: 2026-10-05
Updated: 2026-10-05

## Routing decision

- Intended outcome: local sentence practice is available without adding an environment flag.
- Classification: bounded configuration correction to an existing implemented feature, explicitly requested by the user.
- No public contract, persistence, dependency, security, billing or production rollout change. ADR-0027's deployed defaults-off admission gate remains intact.
- No commit or merge authorized by this correction.

## Context and scope

The local environment omits `LEARNING_SENTENCES_ENABLED`, which previously parsed as false. Development/test now default true; explicit true/false overrides remain valid in every environment. Staging/production continue defaulting false. Update the local example and existing architecture/startup documentation. Provider readiness and credit policy remain enforced.

## Acceptance criteria

- AC-1: missing admission flag enables development/test and disables staging/production.
- AC-2: explicit true/false overrides are honored and malformed values are rejected.
- AC-3: local startup documentation describes the default and opt-out accurately.

## Plan

- [x] Implement bounded environment fallback and local example.
- [x] Add regression coverage for defaults and overrides.
- [x] Run focused checks and inspect the final diff.
- [x] Synchronize affected user-flow documentation and evidence.

## Verification

Checks run on the uncommitted correction patch above main `e888661`, Node 24, on 2026-10-05:

- AC-1/AC-2: `pnpm --filter @languon/backend test -- tests/unit/config/environment.test.ts tests/unit/modules/learning/application/sentence-practice-service.test.ts` passed. The package script's argument handling ran the full default suite: 100 files / 734 tests passed, 32 integration files / 263 tests skipped without disposable opt-ins.
- AC-1: `pnpm test:e2e:sentence-practice-backend` passed, one real composed HTTP/worker journey (4.27 seconds). The test now uses parsed test-environment admission without the flag and asserts the public capability is enabled before exercising generation, AI checking, saved reuse and free personal reference review. Deterministic provider, real Hono/PostgreSQL/Redis, no paid calls.
- Disposable targets: owned `languon-sentence-default-postgres` (PostgreSQL 17, loopback 55449, database `languon_auth_sentence_default_test`) and `languon-sentence-default-redis` (Redis 7, loopback 56399, database 1). Fixture schemas were reset only on these confirmed owned targets; both containers removed after verification. Existing development infrastructure was preserved.
- Backend typecheck and scoped ESLint passed; affected Prettier and `git diff --check` passed.
- AC-3: `pnpm docs:user-flows:check` passed (19 guides); `pnpm user-flow:e2e -- check sentence-practice-backend` passed. Reviewed and executed the mapped test; revision synchronized to `sha256:1e5a880c9cc42bef`.
- Rendered enabled practice behavior reuses the [feature 037 real Chromium evidence](../features/037-sentence-practice-web/EVIDENCE.md) and retained captures. Those journeys supplied enabled admission explicitly; this correction preserves that exact boolean and every frontend component/contract. They establish enabled capability rendering, while the new real HTTP journey establishes missing-flag parsing/composition. No new browser run or missing-flag browser launch is claimed.

## Outcome and evidence

Implementation is confined to environment parsing, configuration regression coverage, the existing mapped journey and matching documentation. Tests never invoke paid model providers. Author preflight inspected the final diff, including explicit overrides and deployed defaults. Independent review is not required for this bounded pure configuration change; no persistence behavior was changed. Backlog tasks remain completed; this correction does not complete, reopen or skip a backlog task.

## Remaining risks

The running backend must reload its environment before the UI capability changes. Explicit local false continues to disable practice. Enabled capability does not replace the existing worker/model readiness requirements.
