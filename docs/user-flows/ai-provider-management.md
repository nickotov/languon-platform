---
feature: ai-provider-management
title: AI Provider and Model Management
status: current
last_verified: 2026-10-04
surfaces:
    - browser
    - admin
    - api
source_paths:
    - apps/backend/src/modules/speech/**
    - .agent/features/028-ai-provider-management/**
    - apps/admin/src/pages/ai-settings/**
    - apps/admin/src/shared/api/**
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/modules/administration/**
    - apps/backend/src/modules/dictionaries/application/**
    - apps/backend/src/modules/dictionaries/infrastructure/**
    - packages/contracts/src/admin/**
    - infra/deploy/**
    - apps/backend/src/infrastructure/text-ai/**
    - packages/contracts/src/text-ai-routing.ts
    - packages/contracts/src/routing-probes.ts
e2e_command: ai-provider-management
e2e_tests:
    - apps/admin/tests/e2e/admin-user-management.journeys.spec.ts
e2e_scenarios:
    - admin-configures-dictionary-ai-default
related_features:
    - admin-text-ai-routing
    - shared-pronunciation-playback
    - user-ai-model-preferences-backend
    - admin-user-management
    - ai-credit-wallet
    - dictionary-platform
---

# AI Provider and Model Management

## What this verifies

An owner publishes server-owned routes and independent per-flow customer tariffs.
New jobs use the effective default or flow override; existing learner model choices
have no authority. Already-admitted jobs keep their immutable routing revision,
provider/model candidates, tariff, provider prices and execution limits.

Text and speech configuration remain separate. See
[Admin-owned text AI routing](./admin-text-ai-routing.md) for synthetic checks,
activation evidence, provider processing controls and emergency disabling, and
[Shared pronunciation playback](./shared-pronunciation-playback.md) for speech.

The mapped journey uses a guarded deterministic provider transport and synthetic
probe executor. It verifies real administration, admission, PostgreSQL snapshots,
worker dispatch, review and acceptance without claiming live vendor availability.
The guide's changed journey awaits final feature execution evidence; its previous
verification date remains historical until that run passes.

## Start the development environment

Use disposable admin E2E PostgreSQL and Redis services from
[Admin user management](./admin-user-management.md). The mapped command requires
its explicit synthetic-probe test configuration. No real provider credentials or
paid services belong in these tests. Follow
[local testing setup](../operations/local-testing-setup.md) for real manual setup.

## Browser verification

1. Sign in as an active owner, configure reviewed operator limits and provider
   USD rates through **AI accounting**, then open **AI settings**.
2. Complete matching selected-flow checks for the intended route, with explicit
   operator expense approval. Inspect configured credentials, processing
   eligibility, worker readiness and observed check evidence separately.
3. Publish enabled routes, default/overrides and approved per-flow input/output
   customer tariffs with a reason. All rates use per-million tokens; provider
   USD costs and customer credit tariffs are separate.
4. Verify **Publish routing** remains reachable at a narrow viewport. Reload and
   inspect the saved revision. No credential values or arbitrary base URL appear.

## Admin verification

Review owner-only configuration publication and its reason/version. Default
changes affect newly admitted work; existing jobs retain their original snapshot.
Learners cannot change this policy or select models. Presentation preferences and
saved spending limits remain learner-controlled.

## API verification

GET and POST `/api/admin/ai/routing` read/publish with an optimistic
`expectedVersion`. Legacy `/api/admin/ai-settings` no longer authorizes new
learner routing. Admit a job, publish a new routing/tariff revision and admit
another job. Inspect their distinct immutable configuration references and pinned
flow tariffs in the disposable database. Start the real worker with its guarded
deterministic provider transport, obtain reviewable proposals and accept one.

## Expected failure and edge cases

- Missing routing, credentials, effective provider rates, required flow tariffs,
  processing approval or matching flow evidence fail closed.
- Retired Kie Gemini 2.5 Pro cannot be activated. EvoLink credentials or synthetic
  probes do not override its pending learner-processing review.
- Duplicate idempotent admission returns the original job after policy changes.
- Stale configuration versions conflict; expired recent sign-in requires a fresh
  owner decision. Neither mutation is automatically replayed.
- Old or incompatible workers cannot claim admitted execution.
- Technical failure produces no learner charge. Successful usage and explicit
  Stop keep the admitted charging policy; provider expenses remain attributable.

## Troubleshooting

Check the job's pinned revision rather than only today's default. A configured
credential or successful quick response does not establish structured-flow
compatibility. Inspect safe diagnostic codes and selected-flow evidence; never
paste provider keys, raw learner prompts or response bodies into reports.

## Automated regression checks

Run the registered command shown by `pnpm user-flow:e2e -- inspect ai-provider-management` against its guarded disposable infrastructure. Run the full critical gate for
shared routing/accounting changes and the production-adapter contract/database
checks described in feature evidence. Live provider checks are separate,
bounded and explicitly authorized; deterministic execution never claims live
readiness or linguistic quality.

## Cleanup

Stop only owned E2E processes and remove only their disposable PostgreSQL/Redis
resources. Preserve shared accounts, content and financial history. Restore a
real route through an audited revision rather than deleting configuration.

## E2E coverage

- `admin-configures-dictionary-ai-default` proves that owner-published flow tariff
  revisions affect new jobs while queued work retains its selected revision.
  It funds the synthetic learner through admin controls, inspects immutable job
  snapshots in PostgreSQL, processes pinned jobs through the real worker using
  deterministic transport, accepts a proposal and reloads saved configuration.
