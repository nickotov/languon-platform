---
feature: admin-text-ai-routing
title: Admin-owned Text AI Routing
status: current
last_verified: 2026-10-26
surfaces:
    - browser
    - admin
    - api
source_paths:
    - .agent/features/054-admin-text-ai-routing/**
    - apps/admin/src/pages/ai-settings/**
    - apps/backend/src/infrastructure/text-ai/**
    - apps/backend/src/modules/text-ai/**
    - packages/contracts/src/text-ai-routing.ts
    - packages/contracts/src/routing-probes.ts
    - apps/admin/tests/e2e/text-ai-routing.journeys.spec.ts
e2e_command: admin-text-ai-routing
e2e_tests:
    - apps/admin/tests/e2e/text-ai-routing.journeys.spec.ts
e2e_scenarios:
    - admin-checks-and-disables-reviewed-route
related_features:
    - ai-provider-management
    - ai-accounting
    - user-ai-model-preferences-backend
---

# Admin-owned Text AI Routing

## What this verifies

An owner can inspect provider configuration, processing eligibility, worker
readiness and actual check evidence separately, explicitly authorize a bounded
synthetic provider check, publish flow routing/tariffs and emergency-disable a
route. Learners see neither model names nor model selectors. Their language,
tone, explanation and maximum-spend preferences remain independent.

The mapped browser journey passed in the
[final feature verification](../../.agent/features/054-admin-text-ai-routing/EVIDENCE.md).
Deterministic probes prove application behavior, not live provider availability,
model quality or multilingual accuracy.

## Start the development environment

Use the isolated loopback PostgreSQL/Redis and admin Playwright configuration
from [Admin user management](./admin-user-management.md). The mapped test requires
`ADMIN_E2E_SYNTHETIC_PROBES=true`; its guarded test executor never contacts a paid
provider. Never point this journey at ordinary local or shared data.

For real manual setup, follow [local testing setup](../operations/local-testing-setup.md).
Keys stay in ignored backend/worker environment files. Publish reviewed provider
USD rates and application/operator budgets before running any real check.
A key alone never authorizes an agent to spend money.

## Browser verification

1. Sign in as an active owner and open **AI settings → Text AI routes**.
2. Inspect processing eligibility and observed worker readiness. Neither a
   configured key nor a fresh worker is proof of a successful flow response.
3. Select a provider/model and **Quick response**. Confirm **Run check** is
   disabled until the displayed maximum operator expense is explicitly approved.
4. Run it once. Inspect passed/failed state, evidence window, latency, usage
   measurement and provider expense. Approval resets after the request.
5. Select **Test selected flow → sentence-check**, approve the displayed cap
   again and run. A quick response alone cannot approve a structured flow.
6. Verify the controls at desktop and narrow viewport widths.

## Admin verification

Publish an enabled primary route, optional ordered fallbacks and per-flow
customer tariffs through **Routing and flow tariffs** after successful matching
checks for every route/flow. Operator-funded Free flows need no learner tariff;
leave their tariff fields blank. They still need provider prices and expense
limits. If a tariff is entered, provide both input and output rates; an incomplete
tariff shows a configuration error. The server requires tariffs for paid flows.
Tariffs are credits per million tokens and remain
independent of provider USD prices. New flows inherit the default policy.

Use **Emergency disable**, enter a reason and confirm. The route becomes disabled
for new dispatch, including queued work; an already-running request retains its
admitted policy. Re-enabling requires explicit audited publication and valid
checks. Do not delete immutable configuration, charges or check history.

## API verification

Owner-only GET `/api/admin/ai/routing` exposes reviewed catalog and current
revision. POST the same path publishes with `expectedVersion`, `configuration`
and a reason. POST `/api/admin/ai-settings/probes` runs only approved synthetic
checks with an explicit displayed maximum cost. POST
`/api/admin/ai/routing/disable` disables a selected route with optimistic version
and reason. No arbitrary endpoint, key or model identifier is accepted.

## Expected failure and edge cases

- A missing key, price, paid-flow tariff, current matching flow check or compatible
  worker blocks activation/admission. An unreviewed provider-processing policy
  also blocks learner dispatch even when synthetic checks pass.
- Changing credentials, adapter, prompt/schema or processing controls invalidates
  matching evidence. Publication requires successful checks within 24 hours;
  age alone does not disable an unchanged active route.
- Retired/authentication failures require rechecking. Timeouts use bounded
  transient recovery and never permanently disable a route by themselves.
- Checks consume operator funds only, within per-probe/daily limits, provider
  concurrency and cooldown. They never reserve or debit learner credits.
- Fallback candidates and economics are pinned at admission. At most one safe
  automatic reattempt fits existing limits; ambiguous upstream execution or
  visible stream output prevents automatic retry.
- Stale versions and expired recent sign-in are actionable errors. Neither
  mutation is replayed automatically.

## Automated regression checks

Run the registered command shown by `pnpm user-flow:e2e -- inspect admin-text-ai-routing` against its guarded disposable infrastructure. Run the full critical gate for
shared routing/accounting changes and the production-adapter contract/database
checks described in feature evidence. Live provider checks are separate,
bounded and explicitly authorized; deterministic execution never claims live
readiness or linguistic quality.

## Troubleshooting

Check provider prices, explicit expense approval, recent owner authentication and
matching selected-flow evidence. A stale version requires reloading the latest
configuration. Inspect safe provider error codes without recording raw prompts,
responses or credential values.

## Cleanup

Stop only owned E2E processes and remove only the disposable infrastructure
created for this test. Restore a real configuration through a new audited
revision; never reset accounts or financial history to repair a route.

## E2E coverage

- `admin-checks-and-disables-reviewed-route` verifies explicit operator expense
  approval, quick and selected-flow checks, evidence display, desktop/narrow
  controls, publication with omitted tariffs for Free flows, audited emergency
  disable and explicit restoration through real
  admin controls with a guarded deterministic probe executor.
