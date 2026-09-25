---
feature: ai-credit-wallet
title: AI Credit Wallet
status: current
last_verified: 2026-09-25
surfaces:
    - browser
    - admin
    - api
    - system
source_paths:
    - .agent/features/029-ai-credit-wallet/**
    - apps/admin/src/pages/users/**
    - apps/backend/src/modules/administration/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/modules/dictionaries/**
    - apps/web/src/fsd/entities/dictionary/**
    - packages/contracts/src/admin/**
    - packages/contracts/src/dictionaries/**
    - infra/deploy/**
e2e_command: ai-credit-wallet
e2e_tests:
    - apps/admin/tests/e2e/admin-user-management.journeys.spec.ts
e2e_scenarios:
    - admin-grants-and-generation-consumes-ai-credits
related_features:
    - admin-user-management
    - ai-provider-management
    - dictionary-platform
---

# AI Credit Wallet

## What this verifies

This guide verifies that an active administration owner can inspect and adjust a user's normalized AI credits, configure limited or expiring/permanent unlimited access, and see immutable ledger activity. With credit enforcement activated after rollout preflight, each new managed dictionary text job reserves one attempt atomically and settles reported use or a labeled conservative estimate. Operational provider and concurrency limits remain separate.

The release does not add subscriptions, checkout, purchased-credit UI, a learner balance page, audio charging, or editable model rates. Subscription and purchase grant sources exist only as future idempotent ledger inputs.

## Start the development environment

Use the disposable administration E2E PostgreSQL and Redis environment from [Admin User Management](./admin-user-management.md). Apply current migrations before starting the backend, admin app, public web app, and dictionary worker.

For manual local verification, keep `DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED=false` until managed routing has a newly saved priced revision and both API and worker run the current release. Then set the flag to `true` on the API and restart it. Tests use deterministic provider transport and synthetic credentials; they do not contact or bill a model vendor.

## Browser verification

1. Sign in to the admin app as an active owner and open a user's detail page.
2. In **AI credits**, confirm policy, available, reserved, consumed, expiry, and ledger history render without exposing credentials or raw prompts.
3. Add a finite admin grant with a reason and optional future expiry. Confirm the management version, available balance, and history update.
4. Switch between limited, permanent unlimited, and future-expiring unlimited. Confirm finite grants remain visible and unchanged while unlimited is effective.
5. Check loading, retry, validation, conflict, and recent-sign-in states with keyboard navigation at desktop and narrow widths in light and dark themes.

Expected result: adjustment and policy dialogs close only after a successful audited mutation. A stale management version reloads current state. A recent-auth failure sends the owner through sign-in without replaying the mutation.

## Admin verification

Confirm policy and adjustment success events appear in Audit with actor, target account, reason, versions, correlation ID, and expiry. A rejected stale version or ineligible deletion-state target creates a rejection audit without changing credits. A removal cannot consume reserved or expired credit.

## API verification

Using a fresh owner administration session, read `GET /api/admin/users/{userId}/ai-credits`, update policy with `PATCH /api/admin/users/{userId}/ai-credits/policy`, and apply a signed adjustment with `POST /api/admin/users/{userId}/ai-credits/adjustments`. Requests require the current management version and a 5–500 character reason. Non-owners, stale sessions, invalid expiries, zero adjustments, and unknown fields fail through the strict administration error contract.

When enforcement is active, a limited user with no available credit receives `ai_credits_exhausted` and no job is created. A sufficient grant admits the same request. Replaying its idempotency key returns the existing job without reserving again.

## System verification

The mapped journey saves a priced managed provider revision, grants synthetic credits, admits one dictionary generation, starts the current deterministic worker, and waits for review. Because that fixture reports no usage, PostgreSQL assertions verify one attempt reservation, a provider-dispatch marker, terminal `estimated` settlement at the reserved bound, and ledger history attributed to the user. The journey then accepts the proposal through the public API.

Before production activation, confirm migrations are applied, all running workers advertise the credit-settlement capability, the active provider revision contains credit pricing, and queued legacy work has the documented compatibility path. Roll back by disabling credit enforcement for new admissions; already credit-accounted jobs must drain on capable workers.

## Expected failure and edge cases

- Missing accounts are limited with zero available credits.
- Expired lots are excluded from new reservations; an existing reservation remains settleable after its lot expires.
- Concurrent admissions and admin removals serialize per owner and cannot overspend.
- A retry reserves only its next attempt. Insufficient retry credit terminalizes before another provider call.
- Cancellation or failure before provider dispatch releases the reservation. Ambiguous failure after dispatch charges the conservative attempt bound as `estimated`.
- Provider-reported usage settles as `provider_reported`; unlimited work records `unmetered` usage without consuming finite grants.
- Deletion-pending and purged targets reject admin mutations. Account purge waits for active work and then removes credit data in the purge transaction.
- Legacy jobs and provider revisions are not retroactively charged.

## Automated regression checks

Run `pnpm test:e2e:ai-credit-wallet`, focused contracts/admin/backend tests, disposable database integration tests, `pnpm db:check`, affected lint/typecheck/build commands, `pnpm docs:user-flows:check`, and `pnpm user-flow:e2e -- check ai-credit-wallet`.

## Troubleshooting

If the panel returns unavailable, confirm the backend has current migrations and the signed-in actor has an active owner membership with recent authentication. If generation still returns `ai_credits_exhausted`, inspect available rather than total issued credits: active reservations, removals, and expiry reduce availability. If activation fails closed, save a new provider configuration after this release so its immutable revision includes credit pricing, and confirm all worker processes run the settlement-capable release.

## Cleanup

Stop the disposable E2E processes and remove only its synthetic database and Redis resources. Do not delete ledger rows or immutable provider revisions in a shared environment. Reverse an incorrect balance through a new reasoned admin adjustment and change policy through the audited endpoint.

## E2E coverage

- `admin-grants-and-generation-consumes-ai-credits` proves an owner grants a limited user's credits in the browser, managed dictionary generation reserves and settles one attempt through the real backend and deterministic worker, the ledger updates, and the resulting proposal is accepted.

Concurrent allocation, expiry ordering, missing usage, retry shortfall, purge ordering, worker fencing, and rejection-audit atomicity remain at focused domain and disposable PostgreSQL layers where timing and invariants are asserted directly.
