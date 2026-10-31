---
feature: admin-text-ai-routing
title: Admin AI routing and audio transcription configuration
status: draft
last_verified: 2026-10-31
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
    - packages/contracts/src/knowledge-transcription-admin.ts
    - apps/backend/src/modules/knowledge/**/transcription-admin*.ts
    - apps/admin/src/shared/api/transcription-admin-api.ts
    - apps/admin/src/pages/accounting/ui/provider-prices/**
    - apps/admin/tests/e2e/text-ai-routing.journeys.spec.ts
    - scripts/dev-readiness/**
    - scripts/dev-doctor.mjs
e2e_command: admin-text-ai-routing
e2e_tests:
    - apps/admin/tests/e2e/text-ai-routing.journeys.spec.ts
e2e_scenarios:
    - admin-checks-and-disables-reviewed-route
    - owner-reviews-disabled-transcription-configuration
related_features:
    - interactive-workbooks
    - ai-provider-management
    - ai-accounting
    - user-ai-model-preferences-backend
---

# Admin AI routing and audio transcription configuration

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
   Read **Check current readiness after AI changes**. The table reports the latest
   historical flow check per route, including failures; recorded evidence age
   does not certify the current execution identity. **Refresh check history**
   reloads existing records without running a provider check.
3. Select a provider/model and **Quick response**. Confirm **Run check** is
   disabled until the displayed maximum operator expense is explicitly approved.
4. Run it once. Inspect passed/failed state, evidence window, latency, usage
   measurement and provider expense. Approval resets after the request.
5. Select **Test selected flow → sentence-check**, approve the displayed cap
   again and run. A quick response alone cannot approve a structured flow.
   The result below the form must match the selected route, check type and flow.
   A selection with no recorded check shows a warning, rather than another flow's
   result. Switching a selection resets expense approval and never starts a check.
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

## Audio transcription configuration

In **AI settings → Audio transcription**, an active owner can prepare a separate
OpenAI `gpt-transcribe` configuration. An owner must review an immutable native
audio-duration provider price, explicitly enter a customer tariff in credits per
minute of source audio, set finite upload/duration/provider-expense bounds, and
record evidence for the provider billing rules. Provider USD prices and customer
credits remain independent. No customer rate or provider pin is invented.

The technical processing route has a code-owned review. Separately verify the
actual configured OpenAI organization/project has training data sharing disabled,
check its explicit account-setting attestation and record evidence without secrets.
The checkbox starts unchecked on every preparation; previous settings do not
renew it. Account evidence expires after30days and is privately bound to the
current server credential. Rotation invalidates the preview and readiness. The
screen never reveals the equality pin or promises regional processing, ZDR
activation or external contractual approval.

**Review configuration** produces a five-minute preview bound to the exact
values and owner session. Editing a field invalidates the preview. **Publish
reviewed configuration** creates an immutable audited revision with optimistic
version checks; it does not call a provider. A disabled configuration can be
prepared while prerequisites are missing. Enabling requires credentials,
compatible observed execution, reviewed billing evidence and a calculable
provider expense bound. A per-minute rate alone does not establish rounding or
minimum billing. Credentials stay in ignored backend/worker environment files;
this screen never accepts or displays API keys.

The deterministic browser scenario leaves transcription disabled, leaves the
customer tariff/provider price blank, explicitly reviews and publishes the
preparation, observes the unchecked account attestation and empty evidence field,
reloads it, and checks narrow controls. It makes no transcription
request and activates no transcription provider. Full production transcription
quality and provider billing precision are separate evidence.

For a reviewed duration price, **AI accounting → Provider cost rates → Add
provider cost rate** offers **Audio duration (native rules only)**. The native
pricing JSON field starts blank, is required, and replaces legacy token/character
rate inputs. Rates, minimums and rounding are never inferred. The mapped scenario
observes these controls and required-field validation without publishing a price.

## API verification

Owner-only GET `/api/admin/ai/routing` exposes reviewed catalog and current
revision. POST the same path publishes with `expectedVersion`, `configuration`
and a reason. POST `/api/admin/ai-settings/probes` runs only approved synthetic
checks with an explicit displayed maximum cost. POST
`/api/admin/ai/routing/disable` disables a selected route with optimistic version
and reason. No arbitrary endpoint, key or model identifier is accepted.

Owner-only GET `/api/admin/ai/transcription` reads transcription readiness and the
current configuration. POST `/api/admin/ai/transcription/preview` reviews a
versioned candidate; POST `/api/admin/ai/transcription/apply` requires its signed
preview and recent owner authentication. Preview/application accept no provider
credentials or arbitrary model overrides.

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

For local development, run `pnpm dev:doctor -- --capability conversation` after
conversation prompt/schema, adapter, credential or processing-policy changes.
Use the affected capability for other flows, or run `pnpm dev:doctor` for all
enabled capabilities. The read-only doctor identifies the route and flow, and
distinguishes no selected-flow evidence, checks for an older execution identity,
and current evidence that denies dispatch. It does not spend operator funds.
An invalidated check can cause `model_unavailable` (503) even with valid keys.
For transient failures, wait for bounded recovery and rerun the doctor first.
Missing or invalidated evidence and hard failures require **Test selected flow**
for the reported route/flow with explicit expense approval, then rerun the doctor.
Changing environment keys or routing is not
required merely to refresh evidence. Age alone does not block an unchanged
active route. Historical records in this screen do not expose current fingerprint
validity; use the doctor for current local admission prerequisites. Doctor unit
tests cover identity changes; synthetic browser checks do not prove live provider
availability.

While history reloads, mutation controls are busy so a stale refresh cannot hide
a newly completed paid check. Expense approval is bound to the selected route,
check type, flow and maximum cost; changing the displayed maximum requires new
approval.

## Cleanup

Stop only owned E2E processes and remove only the disposable infrastructure
created for this test. Restore a real configuration through a new audited
revision; never reset accounts or financial history to repair a route.

## E2E coverage

- `admin-checks-and-disables-reviewed-route` verifies explicit operator expense
  approval, quick and selected-flow checks, evidence display, desktop/narrow
  controls, readiness guidance, selection-specific check history and read-only
  history refresh without paid calls, publication with omitted tariffs for Free flows, audited emergency
  disable and explicit restoration through real
  admin controls with a guarded deterministic probe executor.

- `owner-reviews-disabled-transcription-configuration` verifies real owner
  authentication, explicit disabled preparation without an invented tariff,
  fresh unchecked account-data-sharing attestation and empty evidence, signed
  preview/apply, persistence/reload, narrow controls and absence of
  transcription/provider-check requests.
