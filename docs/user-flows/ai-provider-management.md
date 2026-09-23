---
feature: ai-provider-management
title: AI Provider and Model Management
status: current
last_verified: 2026-09-23
surfaces:
    - browser
    - admin
    - api
source_paths:
    - .agent/features/028-ai-provider-management/**
    - apps/admin/src/pages/ai-settings/**
    - apps/admin/src/shared/api/**
    - apps/backend/src/modules/administration/**
    - apps/backend/src/modules/dictionaries/application/**
    - apps/backend/src/modules/dictionaries/infrastructure/**
    - packages/contracts/src/admin/**
    - infra/deploy/**
e2e_command: ai-provider-management
e2e_tests:
    - apps/admin/tests/e2e/admin-user-management.journeys.spec.ts
e2e_scenarios:
    - admin-configures-dictionary-ai-default
related_features:
    - admin-user-management
    - dictionary-platform
---

# AI Provider and Model Management

## What this verifies

This guide verifies that an owner can select a curated DeepSeek or Kie text model
for Mastra-backed dictionary generation. Configuration is versioned and audited;
credentials remain server-side; text and pronunciation-audio settings remain
separate. A saved default applies to new jobs while an admitted job retains its
provider, model, adapter revision, and budget.

The journey does not perform a paid model request. It starts the real dictionary
worker with a test-only deterministic provider transport, so admission, pinned
routing, worker dispatch, proposal review, and acceptance still cross the real
application and persistence boundaries. Separate wire fixtures cover each
provider's OpenAI-compatible request and structured response mapping.
User-selectable models and per-user allowances are outside this version.

## Start the development environment

Use the disposable admin E2E PostgreSQL and Redis services described in
[Admin User Management](./admin-user-management.md). The mapped command starts
the backend and admin app with a synthetic sanitized DeepSeek capability flag
and the local managed-routing activation gate. It never provisions or sends a
provider credential.

For manual local verification, configure `DEEPSEEK_API_KEY` or `KIE_API_KEY` in
the worker and set the matching sanitized API capability flag,
`DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED=true` or
`DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED=true`. Set
`DICTIONARY_GENERATION_PROVIDER_MODE=mastra`, enable the six applicable job
lifecycle lists, and set `DICTIONARY_AI_MANAGED_ROUTING_ENABLED=true` only after
the API and dictionary worker run the same compatible release. Apply migrations,
then restart the API and worker once. Later admin default changes need no restart.

## Browser verification

1. Sign in to the admin app as an active owner and open **AI settings**.
2. Confirm each provider shows credential and readiness separately. A configured
   key with no fresh worker observation reads as unverified. DeepSeek may report
   available after its authenticated model-list probe. Kie's route-only probe
   remains unverified because it does not prove the key or structured output.
3. Select an enabled provider, enable at least one selectable model, choose an
   enabled default, enter a reason, and save.
4. Reload the page. Confirm the saved provider/model and incremented version
   remain selected. Check keyboard focus, a narrow viewport, and light/dark modes.

Expected result: no key, base URL, raw prompt, or provider response appears in
the page or browser requests. Saving does not call a billable generation route.

## Admin verification

Confirm only curated providers and model identifiers appear. Missing credentials
and an inactive routing gate disable models with an actionable explanation.
Open Audit after a save and confirm the event records the actor, configuration
target, reason, outcome, versions, correlation reference, and one-year expiry.

## API verification

With a short-lived synthetic owner token, GET `/api/admin/ai-settings`. PATCH the
same path with `expectedVersion`, `activeProvider`, `defaultModel`,
`enabledModels`, and a 5–500 character reason. Confirm a stale version returns
`ai_settings_conflict`, a non-owner is denied, arbitrary model IDs are rejected,
and the response never includes a credential value or configurable URL.

Admit a DeepSeek job, change the default to Kie while it remains queued, then
admit a Kie job. Inspect the disposable database and confirm the jobs reference
different immutable revisions. Start the real worker with the deterministic
test transport, confirm both jobs reach review through their pinned snapshots,
and accept one proposal through the public API. Separate database integration
coverage confirms an old-worker claim without the managed-routing transaction
capability cannot move pinned work to running.

## Expected failure and edge cases

- Missing credentials, disabled routing, unsupported models, altered snapshots,
  or unsupported adapter revisions fail closed without provider fallback.
- Duplicate idempotent admission returns the original job after a default change.
- Concurrent settings writes allow one version and return a conflict for the
  stale writer without creating a second active revision.
- Document upload authorization pins routing before upload completion.
- Provider token counts are attributed to the job owner. Conservative settlement
  remains distinguishable from provider-reported usage before future allowances.

## Automated regression checks

Run the mapped admin Playwright command, backend unit and disposable database
integration suites, provider-router contract tests, contracts/admin typechecks,
`pnpm db:check`, `pnpm test:release-deployment`, and the affected builds. Live
provider smoke tests are optional, bounded, and separately authorized; fixture
tests do not claim live vendor readiness.

## Troubleshooting

If all models are disabled, confirm the provider-specific text key exists in the
backend/worker environment and the managed-routing gate is active. If saving asks
for recent authentication, sign in again and make a fresh decision; the UI does
not replay the mutation. On a conflict, reload the latest configuration before
editing. A worker failure for a queued job should be investigated against that
job's pinned revision rather than the current admin default.

## Cleanup

Stop the E2E processes and disposable PostgreSQL/Redis services. Remove only the
synthetic test database/container created for this journey. Leave persisted
configuration revisions in any shared environment untouched; revert a default
through a new audited revision instead of deleting history.

## E2E coverage

- `admin-configures-dictionary-ai-default` proves an owner can save DeepSeek,
  admit work, switch to Kie while that work remains queued, admit more work,
  verify both immutable revisions in PostgreSQL, process both jobs with the real
  worker and deterministic provider transport, accept a proposal, then reload
  the admin page and observe Kie as version 2.
