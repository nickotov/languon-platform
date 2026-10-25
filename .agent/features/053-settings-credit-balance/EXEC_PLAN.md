# ExecPlan: Settings credit balance and focused AI interfaces

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-25

## Goal and specification

Deliver AC-1–AC-5 defined in FEATURE.md. Initial UI improvement escalated after the
user explicitly authorized a learner balance API. Preserve all current work.

## Existing architecture

Web FSD profile page, shared session request/query conventions and UI primitives;
backend authentication and ai-credits participant accountSummary are canonical.
Reuse exact credit decimals and authenticated self identity. ADR-0016 browser proof,
ADR-0045 financial semantics, existing auth routes and no-store behavior apply.
No strategic architectural choice or migration is introduced.

## Test and review strategy

Unit UI consent/settings/error tests; authenticated HTTP tests for identity/precision/
unlimited/read-only behavior; existing disposable browser generation/settings flows.
No paid provider. Existing critical runner owns isolated infrastructure. Actual wallet
projection covered by existing canonical tests plus backend regression as appropriate.
Separate tester not required: no new test harness, concurrency or distributed workflow.
Independent completion and security review required for the new private endpoint.

## Milestones

- [x] M1 — Remove passive display components/slots and update existing test expectations (AC-1, AC-4).
- [x] M2 — Add self balance contract/API and Settings UI (AC-2, AC-3).
- [x] M3 — Browser/static/guide verification and independent reviews (AC-5).

## Current progress

- 2026-10-25: AC-1–AC-5 implemented and verified. All scoped tests, typechecks,
  builds, styling/format/guide checks and targeted browser proofs passed. Reviews
  closed; no open material findings. Evidence records the unrelated full-suite
  workspace passage failure rather than claiming a clean broad test run.
- Final patch frozen and independently approved; local feature commit/squash integration recorded by Git.

## Decisions and discoveries

- D1: Display only available credits, with Unlimited for unlimited accounts; retain
  costs only in explicit action consent. No surprise automatic authorization.
- D2: Existing Settings Credits is a placeholder and no learner wallet endpoint exists;
  explicit user approval obtained before introducing this API capability.
- D3: Full web unit run revealed unrelated unchanged workspace-assistant-context test
  failure clearing a selected passage. Isolated reproduction and reviewer confirm the
  affected hook/test path is unchanged. Report separately, do not hide it.

## Validation links

[EVIDENCE.md](./EVIDENCE.md), [REVIEW.md](./REVIEW.md).

## Remaining work

None after required local Git integration. No push or branch deletion authorized.

- D4: Security review removed unnecessary exclusive wallet locks from the new read.
  Canonical projection is read under a repeatable-read, read-only transaction with
  2s statement and250ms lock timeouts; an actual held-writer regression proves it
  returns the committed balance promptly. No new rate-limiting policy was needed.
