# Per-user AI Credit Wallet

Status: Complete
Owner: Codex
Created: 2026-09-25

## Problem

Dictionary generation records provider token usage and conservative cost bounds,
but product access is still governed by hard-coded rolling owner limits. Owners
cannot assign a finite AI allowance or an unlimited override to a user. The
current model cannot safely support future subscription-period allowances,
purchased extras, or audited admin grants without mutable balances and races.

## Desired behavior

An active admin owner can inspect a user's AI credit account, grant or remove
available credits with a reason, and choose limited or unlimited access with an
optional unlimited expiry. Limited dictionary text-generation jobs reserve one
attempt from eligible credit lots atomically with job creation, settle against
provider-reported usage, and release unused credits. Missing usage settles the
conservative reservation and is labeled estimated. Subscription and purchase
systems can later issue idempotent source-specific grants through the same ledger.

Credits are normalized product units using immutable model-specific rates. They
are not raw model tokens or customer currency. Operational provider budgets,
queue limits, concurrency limits, and circuit breakers remain independent safety
controls. This version exposes balances and history only in the admin application;
learners receive a specific insufficient-credit generation error.

## Acceptance criteria

- AC-1 — A dedicated AI-credit module owns versioned account policy, immutable
  source-specific grants, reservations/allocations, settlement history, and
  effective balances. Missing account state means limited with zero credits.
  Limited/unlimited policy, optional unlimited expiry, integer bounds, lot
  validity, non-negative balances, and append-only history are database-enforced.
- AC-2 — Active owners can read a user's credit summary/history, update limited or
  unlimited policy, and add or remove available credits. Mutations require recent
  authentication, bounded reason, optimistic management version, and atomic
  success/rejection audit. Removal cannot consume reserved or unavailable credits;
  deletion-pending and purged targets reject mutation.
- AC-3 — Grant sources support admin, subscription, purchase, and migration with
  idempotent source references. Subscription grants may expire at the entitlement
  period end, purchase grants are non-expiring, and admin grants have optional
  expiry. Consumption uses earliest expiry first, null expiry last, then creation
  identity. A reservation remains settleable when its source lot expires.
- AC-4 — Every newly credit-accounted dictionary text job pins its credit pricing
  revision and input/output rates. DeepSeek initially costs 1/3 credits per
  input/output token with a 400,000-credit attempt reservation; Kie costs 10/30
  with a 4,000,000-credit attempt reservation. Catalog changes affect new jobs only.
- AC-5 — All five dictionary text-generation admission paths reserve one attempt
  atomically after idempotency replay and before job creation. Insufficient credit
  creates no job and returns `ai_credits_exhausted`. Concurrent admissions and
  admin adjustments cannot overspend or double-reserve.
- AC-6 — A retry extends the reservation by one attempt before a provider call.
  Insufficient credit ends the job as credit-exhausted without another billable
  call. Completion/provider-incurring failure settles reported usage and releases
  the remainder; absent usage charges the conservative bound as `estimated`.
  Pre-provider cancellation/failure releases credit.
- AC-7 — Unlimited access may be permanent or expire. Unlimited jobs record
  normalized usage without charging grants; jobs pin the effective policy at
  admission, so later admin changes do not reinterpret admitted work. Finite grants
  remain available and continue to expire while unlimited is effective.
- AC-8 — Credit-accounted jobs replace the rolling owner daily attempt allowance,
  while owner active concurrency, global daily/provider budget, queue, rate limit,
  and circuit controls remain. Legacy/unactivated jobs preserve existing behavior.
  Older workers cannot claim credit-accounted jobs without settlement capability.
- AC-9 — Admin contracts and UI provide loading, zero, limited, unlimited,
  expiring, exhausted, conflict, validation, denied, and retry states. History
  shows source, adjustment/consumption kind, amount, measurement source, and time
  without prompts, credentials, or provider responses. Credit-rate catalog data is
  read-only in admin.
- AC-10 — Account purge removes operational credit state after active jobs drain.
  Existing provider revisions/jobs remain compatible and are never retroactively
  charged. Credit enforcement is disabled by default and activates only with
  managed routing, a priced active revision, current backend/worker capability,
  and documented rollout preflight.
- AC-11 — Contract, unit, disposable PostgreSQL, HTTP, mapped cross-application
  E2E, real-browser, static/build, migration, independent completion, and security
  verification pass with no unresolved material finding.

## Scope

### In scope

- Normalized AI-credit accounts, grants, reservations, allocation, settlement,
  history, model rate snapshots, and aggregate operational measurements.
- Owner-only admin read and mutation APIs plus the user-detail credit panel.
- Dictionary text generation admission/retry/settlement integration for every
  current format and a learner-visible insufficient-credit error.
- Additive migrations, worker capability gating, account purge, configuration,
  operations guidance, mapped E2E, and rollout/rollback evidence.

### Out of scope

- Subscription plans, billing periods, payment providers, checkout, purchases,
  refunds, invoices, taxes, or legally retained payment records.
- Learner wallet/balance/history UI, starter grants, automatic recurring grants,
  user model selection, TTS/audio charging, or arbitrary admin-editable model rates.

## Constraints and risks

- ADR-0002 governs schema/migrations; ADR-0010 governs owner authorization and
  audit; ADRs 0011/0012/0021 govern dictionary transactions, workers, and immutable
  routing; ADR-0016 requires rendered verification. ADR-0022 owns the new durable
  credit-ledger boundary.
- Credit reservation and job creation, retry extension and claim, settlement and
  terminal job state, and admin adjustment and audit must each be atomic.
- Provider usage may be missing. Estimated settlement must be explicit and never
  reported as provider-measured usage.
- Worker/API/database rollout must fail closed for credit-accounted jobs without
  breaking legacy work. No production activation or paid provider request is part
  of implementation verification.

## User-flow documentation

- Required guide: `docs/user-flows/ai-credit-wallet.md`.
- Related guides: `admin-user-management`, `ai-provider-management`, and
  `dictionary-platform`; update only behavior/source mappings affected by delivery.
- Planned mapped scenario: `admin-grants-and-generation-consumes-ai-credits` in
  `apps/admin/tests/e2e/admin-user-management.journeys.spec.ts`, behind a dedicated
  reviewed `pnpm test:e2e:ai-credit-wallet` command using disposable PostgreSQL,
  isolated Redis, and deterministic provider transport.

## Open decisions

None. Product choices were explicitly resolved in the approved implementation
plan: admin-wallet foundation, normalized pinned rates, zero-credit default,
source-specific expiry, ledger adjustments, optional unlimited expiry, one-attempt
reservation, conservative missing-usage settlement, clear retry exhaustion, and
no learner balance page in this release.

## Completion

Implementation, affected automated and real-app verification, mapped E2E,
completion review, and security review passed on 2026-09-25. Credit enforcement
ships disabled by default; paid-provider smoke testing, production role preflight,
and activation remain operator rollout actions.
