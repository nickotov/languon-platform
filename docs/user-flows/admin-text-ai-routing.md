---
feature: admin-text-ai-routing
title: Admin AI routing and audio transcription configuration
status: current
last_verified: 2026-11-10
surfaces:
    - browser
    - admin
    - api
source_paths:
    - .agent/features/054-admin-text-ai-routing/**
    - .agent/features/062-optional-ai-diagnostics/**
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
    - optional-ai-diagnostics
---

# Admin AI routing and audio transcription configuration

## What this verifies

An owner can inspect provider configuration, processing eligibility, worker
readiness and historical diagnostic results separately, explicitly authorize an optional bounded
synthetic provider check, publish flow routing/tariffs and emergency-disable a
route. Learners see neither model names nor model selectors. Their language,
tone, explanation and maximum-spend preferences remain independent.

The current diagnostic policy is specified in
[Optional AI diagnostics](../../.agent/features/062-optional-ai-diagnostics/FEATURE.md).
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
2. Read **Diagnostics are optional**. Inspect processing eligibility and observed
   worker readiness separately from historical check results. **Refresh check
   history** reloads existing records without running a provider check.
3. Publish a supported, configured route without running any diagnostic. Missing,
   old or failed diagnostics do not block publication or generation.
4. Optionally select a provider/model and **Quick response**. Confirm **Run check**
   is disabled until the displayed maximum operator expense is explicitly approved.
   Run once and inspect the result, latency, usage measurement and provider expense.
   Approval resets after the request; the result does not change route eligibility.
5. Optionally select **Test selected flow → sentence-check**, approve the displayed
   cap again and run. This checks its synthetic probe contract, not the entire
   generation pipeline. The result must match the selected route, type and flow.
   A selection with no recorded check shows an informational notice. Switching a
   selection resets expense approval and never starts a check.
6. Verify controls and optional-diagnostic guidance at desktop and narrow widths.

## Admin verification

Publish an enabled primary route, optional ordered fallbacks and per-flow
customer tariffs through **Routing and flow tariffs**. A successful diagnostic is
not a publication prerequisite. Operator-funded Free flows need no learner tariff;
leave their tariff fields blank. They still need provider prices and expense
limits. If a tariff is entered, provide both input and output rates; an incomplete
tariff shows a configuration error. The server requires tariffs for paid flows.
Tariffs are credits per million tokens and remain
independent of provider USD prices. New flows inherit the default policy.

Use **Emergency disable**, enter a reason and confirm. The route becomes disabled
for new dispatch, including queued work; an already-running request retains its
admitted policy. Re-enabling requires explicit audited publication with valid
configuration; no diagnostic is required. Do not delete immutable configuration, charges or check history.

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

- A missing key, price, paid-flow tariff or compatible worker blocks the applicable
  configuration/admission path. An unreviewed provider-processing policy also blocks
  learner dispatch. Diagnostic success cannot override these prerequisites.
- Changing prompts, schemas, credentials or supported models does not require a
  diagnostic. No missing, expired, mismatched or failed diagnostic blocks routing
  publication or generation. Existing results remain historical observations.
- Actual provider failures use bounded runtime cooldowns and recover automatically
  without manual checks. Diagnostic results do not alter runtime circuit state.
- Checks consume operator funds only, within per-probe/daily limits, provider
  concurrency and cooldown. They never reserve or debit learner credits.
- Fallback candidates and economics are pinned at admission. At most one safe
  automatic reattempt fits existing limits; ambiguous upstream execution or
  visible stream output prevents automatic retry.
- Stale versions and expired recent sign-in are actionable errors. Neither
  mutation is replayed automatically.

## Automated regression checks

Run the registered command shown by `pnpm user-flow:e2e -- inspect admin-text-ai-routing` against its guarded disposable infrastructure. Run the affected shared routing/accounting and production-adapter/database
selections described in feature evidence. Live provider checks are separate,
bounded and explicitly authorized; deterministic execution never claims live
readiness or linguistic quality.

## Troubleshooting

For configuration or generation errors, inspect provider prices, credentials,
processing controls, worker readiness, budgets and required paid-flow tariffs.
A stale version requires reloading the latest configuration. Inspect safe provider
error codes without recording raw prompts, responses or credential values.

For local development, `pnpm dev:doctor -- --capability conversation` inspects
conversation prerequisites; use the affected capability for other flows or
`pnpm dev:doctor` for all enabled capabilities. It makes no paid calls and does
not prove provider connectivity. Diagnostic history is informational and never
causes a failing readiness result on its own. Prompt/schema edits and model
switches do not require a new check. For actual provider failures, inspect the
reported cause and allow bounded runtime recovery. Use **Quick response** or
**Test selected flow** only when an optional paid diagnostic helps investigate;
review and explicitly approve the displayed maximum expense first.

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
  approval, optional quick and selected-flow diagnostics, historical results,
  desktop/narrow controls, optional-diagnostic guidance, selection-specific history
  and read-only refresh. It publishes before any check, publishes again after a
  recovered failed/unknown diagnostic, omits tariffs for Free flows, and verifies
  audited emergency disable/restoration through real admin controls with a guarded
  deterministic probe executor.

- `owner-reviews-disabled-transcription-configuration` verifies real owner
  authentication, explicit disabled preparation without an invented tariff,
  fresh unchecked account-data-sharing attestation and empty evidence, signed
  preview/apply, persistence/reload, narrow controls and absence of
  transcription/provider-check requests.
