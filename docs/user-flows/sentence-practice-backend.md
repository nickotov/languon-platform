---
feature: sentence-practice-backend
title: Sentence practice backend
status: current
last_verified: 2026-10-04
surfaces:
    - api
    - system
source_paths:
    - apps/backend/src/modules/learning/**
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/infrastructure/text-ai/**
    - apps/backend/src/infrastructure/worker/**
    - apps/backend/src/config/environment.ts
    - apps/backend/src/app.ts
    - apps/backend/src/index.ts
    - apps/backend/drizzle/**
    - packages/contracts/src/learning/sentences.ts
    - packages/prompts/src/local/sentence-*.ts
    - infra/deploy/sql/*worker-role.sql
e2e_command: sentence-practice-backend
e2e_tests:
    - apps/backend/tests/integration/modules/learning/sentence-practice.journeys.test.ts
e2e_scenarios:
    - generate-check-reuse-private-and-shared
related_features:
    - user-ai-model-preferences-backend
    - flashcard-training-backend
    - ai-credit-wallet
    - dictionary-permanent-deletion
    - profile-account-controls
---

# Sentence practice backend

## What this verifies

Owner and authenticated shared-reader sentence practice uses current dictionary
entries, personal completion and exposure, bounded typed jobs, pinned model choice
and shared credit/provider capacity. AI checking is the default paid action.
Explicit reference reveal is a free personal manual review, without an AI grade.
Ordinary exercise and job responses keep the reference answer private. The backend
is delivered before the planned Magic Patterns design; no sentence screen is
available yet. See the [implementation plan](../sentence-practice-implementation-plan.md).

## Start the development environment

Use Node 24 and the repository pnpm version. Ordinary local startup is documented
in README: start PostgreSQL/Redis with `pnpm dev:infra`, apply reviewed migrations
with `pnpm --filter @languon/backend db:migrate`, and start with `pnpm dev`.
Use fake local accounts and dictionaries. Deterministic dictionary-worker fixture
mode does not advertise sentence generation/checking readiness and fails closed
for those provider calls; the composed sentence journey injects its own validated
counting provider. Sentence admission defaults off:
`LEARNING_SENTENCES_ENABLED=true` enables the HTTP capability. Workers still drain
already admitted work when this flag is false. Configure managed text routing,
credit accounts and current capable worker observations before paid admission.
Do not put credentials, tokens, private prompts or share keys in logs.

For automated verification, provision a separate loopback PostgreSQL database named
`languon_auth_sentence_<purpose>_test` on a non-default port and Redis database 1–15
on a non-default port. Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`,
`AUTH_TEST_DATABASE_URL`, and `AUTH_TEST_DATABASE_CONFIRM` to that exact name;
set `ALLOW_DISPOSABLE_REDIS_TESTS=true`, `AUTH_TEST_REDIS_URL`, and
`AUTH_TEST_REDIS_CONFIRM` to the exact `host:port/database`. The safe runner has no
fallback target. It resets its owned fixture schemas and uses deterministic
providers, never paid models. Run `pnpm test:e2e:sentence-practice-backend`.

## API verification

1. Authenticate a verified fake learner, create a dictionary and at least one
   complete current entry. Prepare sentence learning in either direction. Confirm
   languages, available modes and personal progress; legacy flashcard capabilities
   retain their strict original shape.
2. Request Next in Saved first using an operation ID and session ID. An empty
   uncompleted pool admits a generation job; replay the same request and obtain the
   same job without another credit reservation. Poll only through live authority.
3. After deterministic worker completion, open the exercise. Source segments
   reconstruct the exact sentence, repeated target occurrences share a hint, and
   hints contain lexical mappings rather than the full reference answer. First
   exposure advances current entry coverage once; replay/opening again does not.
4. Submit a draft for AI checking. Retry the same operation and obtain the same
   pinned job. Completion saves the exact answer and validated feedback. Ratings
   follow server caps; valid morphology is allowed, missing required vocabulary
   caps the result below Good. A successful check completes personal Saved first
   regardless of its grade.
5. On a different exercise explicitly reveal the reference. Confirm a reference
   and ungraded private manual review, separate manual statistics/history and no
   new job, reservation or provider call. Repeat with zero credits and unavailable
   current model: existing saved content still supports reference review. The
   draft remains available to the future client for comparison or later AI checking.
6. Review only reuses valid saved exercises without generation. New only generates
   additively; older generations remain reusable. Saved first drains that learner's
   uncompleted pool before generation. Reference review does not complete it for
   another learner. Same-session reference assistance is captured at AI admission
   and does not penalize the AI score.
7. Enable unlisted sharing and authenticate another learner. Owner-created
   exercises are shareable; reader-created exercises and every attempt/manual
   review are creator-private. Rotate the share key or revoke access and confirm
   reads, replay, dispatch and publication fail without protected data disclosure.

## System verification

1. Run the mapped journey against the owned disposable targets. It composes real
   authentication, routes, PostgreSQL persistence, Redis policy and a counting
   deterministic provider rather than mocking HTTP routes or storage.
2. Run focused real database store, capacity, credit and deletion checks. Verify
   concurrent replay/exposure, stale lease fencing, cancellations, invalid model
   output accounting and combined dictionary/sentence queue/running/provider usage.
3. Edit a contributing entry: saved content retires; authorized personal history
   reports it outdated. Permanently erase an unused copied candidate: all derived
   job input/exercise/answers/reviews disappear, including exercises using another
   target, while that surviving entry's content-free coverage remains.
4. Verify account purge cancels and drains actor work and other learners' work on
   owned dictionaries, deletes foreign personal records, and preserves established
   numerical accounting policy. Apply worker role grants after schema expansion;
   use restricted-role proofs, not migration-owner-only evidence.
5. Disable new admission and confirm capable workers finish or cancel existing
   work. Old workers cannot claim selected learning jobs or increase dictionary
   capacity during active/recent learning overlap without shared-capacity support.

## E2E coverage

`generate-check-reuse-private-and-shared` covers real authenticated admission,
worker generation/checking, replay, reference redaction, personal shared-reader
manual work, free manual completion, zero-credit/unavailable-model review and
separate statistics. Pinned-model selection, private reader generation, revoked
authority, assisted-check metadata and unchanged flashcard capability contracts
have focused lower-layer coverage. Domain and
contract tests cover structural hint/span validation and score rules. Real
PostgreSQL tests cover constraints, races, retention, erasure, leases, allocation
settlement and restricted worker roles. Browser evidence for existing provider
and credit screens remains in their own guides; a new sentence screen awaits design.

## Expected failure and edge cases

- Disabled sentence capability, expired sessions, archived dictionaries, removed
  shares and stale entry versions fail without returning a protected reference.
- An exhausted wallet or unavailable model blocks new generation/AI checking;
  saved selection and explicit valid reference review remain free. An empty saved
  pool cannot manufacture a free reference. No error automatically reveals it.
- Combined queue/running saturation, excessive queue age or provider daily-budget
  pressure returns retryable `503 capacity_unavailable`, with `Retry-After`, rather
  than missing-content404. Existing valid free reference review remains available.
- Conflicting operation payloads fail rather than generating again. Content erasure
  invalidates old receipts; a replay cannot silently charge for replacement work.
- Pending, cancelled, timed-out, retried and stale-fenced jobs never publish late
  results. Known provider usage is settled even when generated content is invalid.
- Manual review has no percentage, rating or automatic correctness verdict. Valid
  translations can differ from the one reference; AI evaluates language quality.
- Revealing after an AI submission does not retroactively change its assistance
  metadata. Hints and reference assistance never reduce a valid AI grade.

## Automated regression checks

- `pnpm test:e2e:sentence-practice-backend` — owned PostgreSQL/Redis composed journey.
- `pnpm --filter @languon/contracts test` — public validation and privacy contracts.
- `pnpm --filter @languon/backend test` — deterministic domain/application tests;
  disposable integration tests require their explicit environment opt-ins.
- `pnpm docs:user-flows:check` and
  `pnpm user-flow:e2e -- check sentence-practice-backend` — guide traceability.
- `pnpm db:check` — generated migration consistency; deployment classification also
  checks the reviewed migration digest.

## Troubleshooting

A model-unavailable response requires matching fresh worker observations for the
requested format, selected execution, combined capacity and credit settlement;
an old selection-only observation is insufficient. Check configured model,
credentials and worker readiness without logging credentials. If credit admission
fails, inspect numerical account policy/reservations. If a previously valid shared
exercise disappears, check live share authority and current entry versions before
retrying. A migration digest mismatch on a disposable fixture needs an owned reset;
never apply that reset to a shared database.

## Cleanup

Stop only processes and containers created for the verification run. Remove fake
fixtures through supported APIs. The journey resets only its explicitly confirmed
owned test schemas and Redis database. Destructive resets are restricted to that
owned disposable target; ordinary development, shared, staging and production
infrastructure must remain untouched. Keep branches and source evidence for review.
