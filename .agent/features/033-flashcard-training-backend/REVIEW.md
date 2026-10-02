# Review: Flashcard training backend and design handoff

Reviewed: 2026-10-02
Reviewers: Independent learning_completion_review and learning_security_review
Verdict: PASS after remediation; no open material findings

## Review boundary

Initial independent completion review covered the complete backend patch,
including untracked files, contracts, dictionary writers, persistence, migrations,
cleanup, API tests, rollout and the code-grounded prompt. Inputs were AC-1–AC-9,
the baseline, accepted ADRs and [EVIDENCE.md](EVIDENCE.md). Base:
`b7f4fe7a2212df6982a05a1bcbed8408d3cacd04`.

Final source/test/tool manifest:
`08b55d551693d8e7e0f4c83570a816be58bb857e957ed846e1cd9618f0ab5223`.
The reviewer acknowledged final formatter-only changes and composed-test hash
`556f51c1954d9615377a0034367ad68fee1487139f5edec63af49cb8d16fb843`.
Follow-up reviews were narrowly scoped to R-1/R-2 and affected invariants.

A separate persistence tester verified foreign-account purge, deletion locking
and lifecycle races: five final real PostgreSQL tests passed. Independent security
review covered authorization, personal data, SQL and purge, plus R-1 remediation.

## Findings and resolution

### R-1 — Medium — Unavailable entry misclassified as missing dictionary

Location: learning Drizzle store target checks and HTTP error mapping.
Removed/archived targets returned dictionary-not-found, making clients abort an
accessible dictionary instead of skipping an unavailable card.

Fixed: distinct entry-unavailable error maps to `entry_not_found` HTTP 404 after
dictionary authorization. Missing/revoked dictionaries retain their errors.
Service/HTTP tests, PostgreSQL regressions and composed HTTP journeys prove
dictionary access survives entry removal. Security follow-up confirms no
enumeration leak. Disposition: resolved.

### R-2 — Medium — Missing referencing-FK lookup indexes

Location: learning progress schema and generated migration 0040.
Dictionary/entry and latest-attempt FK lookups lacked suitable leading indexes,
risking broad scans during cleanup as shared learning history grows.

Fixed: both indexes plus generated SQL/snapshot/journal. Generic FK-index audits
cover all learning tables; natural PostgreSQL plans over 5,000 progress rows use
both indexes without forced planner settings. Final migration, store, lifecycle
and purge suites pass. No authorization change. Disposition: resolved.

## Security verdict

The final store-test Prettier-only change was independently rechecked. Production
hashes and assertions are unchanged; the executed PostgreSQL 17/17 evidence is
valid for the formatted test. No expanded review was required; PASS is unchanged.

PASS; no material exploitable findings. Reviewed bearer/active-session checks,
live transactional dictionary authority, learner-scoped state/replay/Undo,
parameterized bounded SQL, content-free history, non-enumerating responses and
foreign-dictionary learner purge. R-1 target checks follow access validation.

## Completion audit and residual limits

AC-1–AC-9 map to passing evidence. DDD boundaries, writer revision paths,
idempotency, concurrency, lifetime rules, bounds, migrations and prompt provenance
were reconciled with implementation. No open material finding remains.

Production rollout and reverse-proxy header logging are not tested here. An
admitted request may finish during session-only revocation; active-user and
dictionary authority are checked transactionally. Application validation enforces
JSONB/state coherence beyond database constraints. Session UUID uniqueness is a
client responsibility. These are boundaries, not security waivers.

Frontend/browser implementation and other exercise modes remain outside this
completed backend slice. BL-002/BL-003 remain in progress. The feature flag is
disabled by default; no production rollout occurred. Stop for returned design.
