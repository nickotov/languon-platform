---
feature: user-ai-model-preferences-backend
title: Learner AI budgets and server-owned dictionary execution
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

# Learner AI budgets and server-owned dictionary execution

## What this verifies

The authenticated legacy preference endpoints now expose only the learner action
budget and its optimistic version. Routing is owned by administration under
[ADR-0046](../adr/0046-admin-owned-text-ai-routing.md). Existing explicit learner
choices cannot override the approved route. Internal execution snapshots retain
provider identity for operations and accounting; learner responses hide it.

## Start the development environment

Use the registered disposable runner from the repository root. It requires
`ALLOW_DISPOSABLE_DATABASE_TESTS=true`, an explicitly confirmed loopback
`AUTH_TEST_DATABASE_URL` on a non-default port, and matching
`AUTH_TEST_DATABASE_CONFIRM`. Redis requires
`ALLOW_DISPOSABLE_REDIS_TESTS=true`, a confirmed loopback
`AUTH_TEST_REDIS_URL` on a non-default port with a nonzero database, and matching
`AUTH_TEST_REDIS_CONFIRM`. Never target development or shared storage.

```sh
pnpm test:e2e:user-ai-model-preferences-backend
pnpm user-flow:e2e -- check user-ai-model-preferences-backend
pnpm docs:user-flows:check
```

Only synthetic credentials, reviewed routing/pricing fixture data and deterministic
providers are used. No paid request runs. The fixture closes its clients and
resets only its explicitly confirmed disposable targets. Do not run another suite
against those targets concurrently; remove only owned temporary containers.

## API verification

1. An active signed-in learner reads `/text-ai/models`: it returns an empty
   model list and null default. Preference reads return `mode: auto`, null
   `modelId` and `selectedModel`, the exact budget and its current version.
2. Save an exact action budget (`20.125` in the synthetic journey) with the
   expected version. Reload preserves the budget and new version.
3. Stale writes conflict without replacing the newer budget. Attempts to select
   an explicit model are rejected without disclosing provider details or
   modifying the saved budget. Other accounts remain independent.
4. Dictionary generation uses the approved server route and pins its immutable
   execution and tariff. Updating the learner budget affects only new work;
   replaying the original operation returns its original job.
5. Disabling a learner prevents reads and updates. Neither catalog nor personal
   settings reveal model identities, provider URLs, credentials or probe data.

## Expected failure and edge cases

- Not authenticated: sign in and retry.
- Version conflict: keep the local budget draft, load the current value and
  explicitly decide whether to use it or overwrite against the new version.
- AI unavailable: retry later or use saved learning content. Learners cannot
  repair provider configuration by selecting a model.
- Network retry: preserve optimistic versions and AI operation identity. Never
  create duplicate admissions or charges on reconnect.
- No approved compatible route, tariff, price or worker evidence: admission fails
  closed; administrators inspect safe setup and health diagnostics.

## E2E coverage

`learner-preference-pins-dictionary-execution` retains its stable scenario ID.
It verifies real authentication, a redacted catalog, exact budget save/reload and
conflict, explicit-selection rejection, server-owned dictionary execution,
same-key replay after a budget change and inactive-account denial through the
composed API with PostgreSQL and Redis. It does not prove paid provider quality.
Worker readiness, pricing history and execution fencing remain in focused tests.

## System verification

Admission uses the approved server routing revision and matching worker format.
Learner preference writes cannot change that routing authority. Missing approved
routing fails closed without enqueueing or charging.

## Automated regression checks

Run the mapped command above and focused preference-service, authenticated-route,
persistence and routing tests. Production provider execution is covered by the
critical AI execution gate with synthetic HTTP, not paid model requests.

## Troubleshooting

A skipped run is missing evidence: inspect disposable PostgreSQL/Redis confirmation
settings rather than bypassing them. Admission failure needs an enabled approved
route, matching synthetic check evidence, reviewed provider prices and fresh
worker capability evidence. Never use live provider keys in this runner.

## Cleanup

Close clients and remove only infrastructure created by this verification.
Never use shared, staging or production data.
