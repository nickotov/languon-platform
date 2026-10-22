---
feature: user-ai-model-preferences-backend
title: Learner model preference backend and pinned dictionary execution
status: current
surfaces:
    - api
    - system
last_verified: 2026-10-04
source_paths:
    - packages/contracts/src/text-ai
    - apps/backend/src/modules/text-ai
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle
    - apps/backend/src/infrastructure/database/schema.ts
    - apps/backend/src/index.ts
    - apps/backend/src/app.ts
e2e_command: user-ai-model-preferences-backend
e2e_tests:
    - apps/backend/tests/integration/modules/text-ai/user-ai-model-preferences.journeys.test.ts
e2e_scenarios:
    - learner-preference-pins-dictionary-execution
related_features:
    - ai-accounting
    - ai-provider-management
    - ai-credit-wallet
    - dictionary-platform
    - profile-account-controls
    - magic-profile-page
---

# Learner model preference backend and pinned dictionary execution

## What this verifies

This backend-only journey belongs to
[feature 035](../../.agent/features/035-user-ai-model-preferences-backend/FEATURE.md).
Profile budget presentation and affordable-action confirmation are covered in
[AI accounting and action budgets](./ai-accounting.md). This guide owns the
authenticated preference/version and pinned-execution backend boundary.

## Start the development environment

Run from the repository root using the reviewed package command. The runner does
not start or stop containers and must never target a development/shared database.
Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, a dedicated loopback
`AUTH_TEST_DATABASE_URL` on a non-default port, and
`AUTH_TEST_DATABASE_CONFIRM` matching its authentication-test database name.
Set `ALLOW_DISPOSABLE_REDIS_TESTS=true`, a dedicated loopback
`AUTH_TEST_REDIS_URL` on a non-default port with a nonzero database, and
`AUTH_TEST_REDIS_CONFIRM` matching its `host:port/database`. The command refuses absent/unsafe
targets before executing migrations or tests. Use synthetic users/credentials
and deterministic providers only; no paid provider calls.

```sh
pnpm test:e2e:user-ai-model-preferences-backend
pnpm user-flow:e2e -- check user-ai-model-preferences-backend
pnpm docs:user-flows:check
```

The fixture initializes/reset only its explicitly confirmed disposable database
and Redis, uses the real authentication composition and preference/dictionary
repositories, and closes connections after execution. Do not run another suite
against the same disposable targets concurrently. Remove only owned temporary
containers when no longer needed; never reuse shared PostgreSQL/Redis for this.

## API verification

1. A signed-in active learner requests the sanitized text model catalog and their
   preference. An absent stored preference returns Auto with version zero.
   `maxCreditsPerAction` is an exact decimal string or null while no default is calibrated.
2. They save a currently enabled, compatible explicit model with the expected
   preference version and optional exact `maxCreditsPerAction` (`20.125` in the
   synthetic journey). Reading again returns their selection, exact budget and
   new version. Model choice never raises that saved budget.
3. A stale update conflicts; it does not overwrite the newer preference. Another
   learner's preference remains independent. Foreign identities are not supplied
   through the preference request.
4. Dictionary generation resolves the learner's explicit model and pins its
   immutable execution/pricing while retaining the configuration revision.
5. Changing to Auto affects a new operation only. Replaying the first operation
   returns its original job/model rather than interpreting the new preference.
6. A disabled or unavailable stored selection remains visible with an actionable
   status. New work fails without fallback, enqueueing or silently resetting it.
7. A disabled/deleting learner cannot read or modify personal settings. Catalog
   and errors never expose credentials, URLs, credential references or probe data.

The catalog reports readiness for explicit selection, including fresh matching
worker selection capability under a versioned observation identity and a compatible
runtime format. Explicit admission requires that exact requested format; a fresh
older-format worker cannot make new-format work available. Legacy worker upserts
cannot refresh newer capability evidence. Existing Auto admissions retain the compatible
global-revision path; known fresh default-provider unavailability fails. Provider
HEAD probes may be unverified yet operationally usable under existing policy;
unverified is not a silent model fallback.

DeepSeek Chat is retired during development (ADR-0038). Catalogs expose Flash
and Kie. Retired snapshots fail closed; use existing administration to select a
current default and preferences to deliberately select Auto or a supported model.
Immutable execution and accounting records are never rewritten as Flash.

## Expected failure and edge cases

- Not authenticated: sign in and retry the personal operation.
- Preference version conflict: reload, preserve the intended choice and explicitly
  save against the current version.
- Explicit model disabled, unsupported, missing credentials or without capable
  workers: keep the preference and deliberately choose another model or Auto.
- Default unavailable: retry after availability recovers or choose an enabled
  compatible explicit model; the backend never chooses an alternative silently.
- Network retry: preference updates retain optimistic-version semantics; AI
  request retry reuses its operation ID so it cannot create another admission.

## E2E coverage

`learner-preference-pins-dictionary-execution` proves real authentication, catalog
redaction, exact action-budget and model preference save/reload/conflict,
explicit model job pinning, same-key
replay after a preference change, Auto affecting only a new admission, unavailable
selection failing without enqueue and inactive-user denial through the composed
API with real PostgreSQL/Redis. Exhaustive constraints, races, claim capability,
historical pricing and provider failures belong to focused lower-layer tests.

This does not prove a profile picker, sentence UI, frontend fidelity or paid
provider execution. Evidence and outstanding checks are recorded in
[EVIDENCE.md](../../.agent/features/035-user-ai-model-preferences-backend/EVIDENCE.md).

## System verification

Selected jobs pin immutable model/pricing and require a selection-capable worker.
Circuit breakers are scoped by pinned provider/model/format, so another model's
failure or success cannot block or clear the selected model's circuit.
Legacy/Auto work keeps its existing global-revision compatibility. Preference
changes and model disablement do not reinterpret an admitted job. Account purge
removes preferences explicitly because user tombstones remain. Database claim
and snapshot guards are verified independently of the API journey.

## Automated regression checks

Use the registered E2E command in Startup. Lower-layer disposable integration
covers preference concurrency, strict schema constraints and provider observation
readiness; unit tests cover current/historical execution validation and format
compatibility. Relevant provider, credit and flashcard regressions remain required.

## Troubleshooting

If a test target is refused, verify the loopback non-default port, dedicated
languon_auth_*_test database and exact confirmation. If explicit admission reports
unavailable, inspect only sanitized capability/configuration status, not credentials
or raw provider responses. A successful HEAD-only probe can be unverified under
existing provider policy; an absent/stale/incapable observation cannot admit an
explicit selection.

## Cleanup

The fixture closes clients and resets only confirmed disposable storage. Remove
only containers created for this verification after all dependent suites finish.
Never run fixture cleanup against development, staging or production services.
