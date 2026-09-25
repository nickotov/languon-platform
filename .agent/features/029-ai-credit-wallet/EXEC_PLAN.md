# ExecPlan: Per-user AI Credit Wallet

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-25
Status: Complete
Branch: `feature/ai-credit-wallet` from `main` at `6e95c45`

## Goal and specification

Deliver the admin-managed, future-compatible AI credit wallet described by
AC-1 through AC-11 in `FEATURE.md`. Subscription/payment implementation and a
learner wallet UI remain excluded.

## Existing architecture

- Dictionary jobs already pin provider pricing bounds and persist reserved/actual
  input/output tokens and cost. `DrizzleDictionaryGenerationStore` atomically
  admits, retries, settles, and releases jobs but currently applies hard-coded
  three-attempt rolling owner and twenty-attempt global budgets.
- ADR-0021 keeps curated model/rate data and immutable execution revisions inside
  the dictionary module. Existing revisions do not contain product credit rates.
- Administration owns owner authorization, recent authentication, optimistic
  mutation, audit, and Refine routes. The user-detail page is the established
  per-user operational surface.
- Account purge explicitly deletes dictionary-owned data before leaving a minimal
  user tombstone. Credit operational rows must join that ordered purge.
- Generated Drizzle schema/migrations live under `apps/backend`; worker claims use
  transaction-local capability flags to prevent old releases claiming new work.

## Test and review strategy

- Unit: credit pricing, effective unlimited policy, expiry ordering, allocation,
  adjustment, reservation extension, settlement/release, and error mapping.
- Contract/HTTP: strict admin schemas, recent-auth/owner enforcement, conflicts,
  validation, sanitized history, and dictionary HTTP 402.
- Disposable PostgreSQL: clean migration, constraints/indexes, concurrent
  reservation/adjustment, idempotency, expiry during reservation, retries,
  settlement source, audit atomicity, worker capability, and account purge.
- E2E/browser: real admin/backend/web/worker journey with deterministic provider;
  desktop/narrow, keyboard, light/dark/system, loading/error/conflict states.
- Static/build/docs: affected lint/typecheck/build, migration check, guide mapping,
  web/admin/backend/contracts tests, and final repository checks.
- Independent completion review: required after author preflight.
- Separate tester: required because the feature adds a new cross-application
  admin-to-wallet-to-worker journey and concurrent reservation behavior.
- Security review: required for privileged balance mutation, authorization,
  SQL concurrency, model usage, future-value ledger, and external provider calls.

## Milestones

- [x] M1 — Durable credit domain and migration (AC-1, AC-3, AC-4, AC-10)
    - Add ADR-0022, domain/application seams, schema, generated migration, account
      purge integration, catalog rate revision, and focused unit/database tests.
- [x] M2 — Generation reservation and settlement (AC-4–AC-8, AC-10)
    - Integrate all admissions, retries, terminal paths, worker capability,
      activation configuration, errors, metrics, and compatibility coverage.
- [x] M3 — Admin contracts, APIs, audit, and UI (AC-2, AC-9)
    - Add strict contracts/routes/store operations and the responsive user-detail
      credit panel with focused component/HTTP/database tests.
- [x] M4 — Cross-application guide and verification (AC-5, AC-9–AC-11)
    - Create guide/mapping/command, deterministic E2E, browser evidence, migration
      verification, affected static/build checks, and rollout documentation.
- [x] M5 — Author preflight, independent reviews, remediation, completion (AC-11)
    - Reconcile acceptance/evidence, inspect final diff, complete tester,
      completion/security reviews, remediate, rerun affected proof, and squash merge.

## Current progress

- 2026-09-25 — User approved the decision-complete plan and authorized implementation.
- 2026-09-25 — Created Feature 029 workspace and feature branch from current main.
- 2026-09-25 — Early architecture review confirmed caller-owned transactions with
  a credit transaction participant and found per-attempt/document/capability gaps.
- 2026-09-25 — Implemented the dedicated credit domain, four additive migrations,
  admin APIs/UI, all generation admission/retry/terminal paths, purge, worker role
  and capability controls, inactive rollout flag, contracts, and learner errors.
- 2026-09-25 — Focused unit, integration, migration, deployment, build, mapped E2E,
  and real-browser checks passed. The E2E was made revision-independent and passed
  again against a database containing prior provider revisions.
- 2026-09-25 — Author preflight found no secret, generated evidence, debug code,
  whitespace error, or accidental product scope.
- 2026-09-25 — Independent completion and security reviews found retry-policy,
  worker-privilege, provider-settlement, public-error, route-state, OpenAPI, usage-
  provenance, and database-boundary gaps. All were remediated and the affected
  automated, disposable-database, deployment, and mapped browser checks passed.
- 2026-09-25 — Completion review and security re-review approved the final diff
  with no unresolved material findings.

## Decisions and discoveries

- D-1 — AI credits form a dedicated bounded module. Administration owns privileged
  authorization/audit and dictionaries own generation orchestration; both use the
  credit module's invariant-preserving transaction participant. Putting a mutable
  balance on `users` or provider settings was rejected.
- D-2 — A missing account is limited zero. Credits arrive as source-specific lots;
  subscription and purchase source kinds are persisted now, but only admin grants
  are externally writable in this feature.
- D-3 — Jobs pin code-owned credit rates independently of vendor cost fields.
  Existing catalog rates initialize DeepSeek at 1/3 and Kie at 10/30 credits per
  input/output token. Admin-editable commercial pricing is rejected in this scope.
- D-4 — One attempt is reserved at a time. This limits balance lock-up; retry
  shortfall becomes terminal before another provider call rather than creating a
  new waiting lifecycle.
- D-5 — Enforcement ships inactive, requires managed routing and current worker
  capability, and never backfills charges. Legacy revisions/jobs drain unchanged.
  ADR-0022 records the cross-feature rule.
- Discovery — Existing job-level provider accounting discards reported usage on a
  retry and estimates earlier attempts at their maximum. Credit charging therefore
  requires unique job/attempt reservations and settlements plus a fenced provider-
  dispatch marker; final job totals are insufficient.
- Discovery — Document generation terminalizes through the document store, and
  claim sweeps stale/cancelled work before queued-to-running. Credit settlement and
  worker capability enforcement must cover those paths as well as ordinary
  generation completion/failure.

## Validation links

- Acceptance-to-proof mapping and checks: [EVIDENCE.md](./EVIDENCE.md).
- Review boundary, findings, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining work

Implementation, verification, and independent review are complete. The required
local feature commit and squash merge remain as delivery mechanics. Live paid-
provider verification and production activation remain separate operator actions.
