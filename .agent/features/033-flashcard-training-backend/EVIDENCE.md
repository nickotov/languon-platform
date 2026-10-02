# Verification evidence: Flashcard training backend and design handoff

Updated: 2026-10-02
Status: Verified backend scope; independent completion and security reviews passed

## Tested state

Base b7f4fe7a2212df6982a05a1bcbed8408d3cacd04 plus final changed/untracked source,
tests, migrations and tooling. Captured 46 files under apps/backend, packages/contracts,
scripts and .env.example. SHA256 08b55d551693d8e7e0f4c83570a816be58bb857e957ed846e1cd9618f0ab5223.
Reproduce capture by sorting those modified/untracked non-tsbuildinfo paths, hashing
each file, joining path + NUL + SHA256 with newlines, then hashing the manifest.
Unchanged files are identified by the base. Documentation is separately verified
below; HEAD alone is not the tested state.

Dictionary31 evidence was captured at executable test hash
d0a71afb0582f0eb8f5033043682fc88ba82a25666b7c224fe1c53a8c05f3653.
Final a03aa4490c3b3bab11f296592673cd1417267db4c80f5978478565d78cc88f64
differs only by two explanatory comments, so evidence is reused. Other current
source/proof hashes: store62617cfb6716fe1462c7a63ceba213e71d603f726be1a8bc3a0507ff1a529586;
schema7258e2ac9ad4e2919916bf8da4a520f069750c0459bdc32f177c9895dc84b482;
lifecycle330e29e20373369e8c8371927a4b6227044a2159d7c0599585d8ae0b5614badf.

## Acceptance coverage

| ID   | Implementation                                                                                | Evidence            | Result |
| ---- | --------------------------------------------------------------------------------------------- | ------------------- | ------ |
| AC-1 | Canonical helper; manual/two AI writers; selective default scan; epoch schema                 | E-1/E-2/E-6         | Pass   |
| AC-2 | Strict contracts; role-relative projection/fallback/dedupe; bounded selector/manifest/items   | E-1/E-3/E-5         | Pass   |
| AC-3 | Learner preferences, attempts/current rows, concurrency/idempotency                           | E-1/E-3/E-5         | Pass   |
| AC-4 | Latest Undo/replay, prior-current restoration, stale/newer-state guards, active totals        | E-1/E-3/E-4/E-5     | Pass   |
| AC-5 | Active bearer/live owner/shared checks; anonymous read-only; admission/security/error mapping | E-1/E-3/E-4/E-5/R-1 | Pass   |
| AC-6 | Composite cascades, explicit foreign learner purge, archive/fork isolation                    | E-3/E-4/E-6/R-2     | Pass   |
| AC-7 | Generated0037–0040, monotonic defaults, flag/rollback floor, bounded/indexed access           | E-2/E-3/E-6/E-7/R-2 | Pass   |
| AC-8 | Real API guide/runner, static/build checks, independent security/test/completion review       | E-4–E-9/REVIEW      | Pass   |
| AC-9 | Code-grounded canonical prompt, exact frozen v001, no frontend target                         | E-9                 | Pass   |

## Check records

### E-1 — Contracts, pure logic and service/HTTP unit tests

- Commands: pnpm --filter @languon/contracts test; contracts build/lint/typecheck;
  pnpm --filter @languon/backend exec vitest run tests/unit.
- Contracts65/65; backend644/644 across89 files. Included pure projection5 and
  dictionary canonical/schema18. Current service/HTTP21 verifies owner/shared,
  validation, disabled/access/errors, concrete Redis scope validation and R1.
- No paid or nondeterministic model service. Production Redis scope mismatch was
  found by real journeys, not masked by unit results; remediation has coverage.

### E-2 — Dictionary writers, defaults and capacity

- Command: guarded disposable PG environment plus pnpm --filter @languon/backend
  exec vitest run --no-file-parallelism
  tests/integration/modules/dictionaries/infrastructure/drizzle-dictionary-repository.test.ts.
- Final31/31 passed80.98s. Includes manual no-op/dormant/context/A→B→A, inherited/
  overridden/archived defaults preserving authored metadata, 10k selective invalidation
  and real indexed scan plan, fork/import/cancellation/deletion regressions.
- AI-authoring file dictionary-card-authoring-generation-store.test.ts passed8/8
  in the final scoped root regression run, exercising new epoch assertions in both
  AI existing-card acceptance paths. Production dictionary code unchanged afterward;
  subsequent R1/new learning indexes do not alter these writers.

### E-3 — Learning persistence and indexed lifecycle lookups

- Command: guarded PG environment plus pnpm --filter @languon/backend exec vitest run
  tests/integration/modules/learning/infrastructure/drizzle-learning-store.test.ts.
- Final17/17: three always-running FK/index schema audits plus14 real PG tests.
- Covers projection/manual selection/cursor, preference races, global operation
  reuse and replay, Undo across sessions/latest-state guards, stale revisions,
  revocation/inactive users, edit/rating locking, cascades and10k manifest/batch limits.
- R1 archive/delete regressions distinguish unavailable targets from revoked
  dictionaries and preserve remaining state/access. R2 seeds200 entries ×25 learners
  (5000 attempts/progress in500-row batches), ANALYZE and natural EXPLAIN ANALYZE
  choose both new progress FK indexes without forcing planner options.
- Schema audit verifies every referencing FK across all three learning tables has
  a suitable leading index. Final schema/test hashes recorded in REVIEW.

### E-4 — Independent lifecycle, purge and race checks

- Command: guarded PG environment plus pnpm --filter @languon/backend exec vitest run
  tests/integration/modules/learning/learning-lifecycle.test.ts.
- Final5/5 post-0040 passed2.22s: foreign-dictionary learner purge, inactive access,
  multi-learner card/dictionary cascades, archive/restore/fork, concurrent duplicate
  operation and committed deletion-pending learner-row-lock race.
- Purge regression file tests/integration/modules/users/infrastructure/
  drizzle-account-purge-store.test.ts passed8/8 on final0040 schema.
- Separate tester authored and executed the bounded lifecycle proof independently.

### E-5 — Actual composed HTTP/authentication journeys

- Command: node scripts/run-flashcard-training-e2e.mjs.
- Final post-R2 run3/3 passed7.85s using actual authentication signup/verification,
  JWT/session service, dictionary/learning composition, PostgreSQL17 and Redis7.
  Hono HTTP journeys execute in-process, not through a reverse proxy.
- Owner prefs conflict/projection/rating replay/payload conflict/Undo plus loaded-entry
  archival: fresh rating and Undo404 entry_not_found while dictionary/progress remain200.
- Two shared learners have independent preferences/progress; anonymous personal
  requests and invalid bearer return401 without writes; key rotation/replay returns404.
- Runner owns isolated ephemeral55445/55446 containers, refuses existing names,
  overrides guarded test endpoints and cleans only containers it started.
- Registered guide revision sha256:4a4c05b26fc6dd4e is synchronized with three scenarios.

### E-6 — Clean/additive/schema migration proof

- Command: guarded PG environment plus pnpm --filter @languon/backend exec vitest run
  tests/integration/database/migrations.test.ts --testTimeout=30000 --hookTimeout=60000.
- Final6/6 passed after0040: clean41-migration schema, idempotency, simultaneous
  singleton migration runners, tamper rejection and seeded pre-learning vocabulary
  upgrade preserving text/authored version/default epoch1 and positive constraint.
- Checked-in SQL/snapshots0037–0040 generated through pnpm db:generate; db:check passes.
  No generated SQL hand edits or destructive down-migration.
- Forward deployment requires migrated schema/compatible card writers and purge
  workers before flag activation. Rollback floor is documented in ADR-0024; no
  production rollout or incompatible rollback was executed.

### E-7 — Affected static/build checks

- Backend lint/typecheck/build; contracts lint/typecheck/build; pnpm db:check passed.
  Final lifecycle fixture timestamp-only update also passed full backend tsc.
- Changed supported files pass Prettier; git diff --check passes.
  New runner/registry files pass scoped ESLint.
- Environment example adds only disabled-by-default LEARNING_FLASHCARDS_ENABLED.
  No runtime dependency, lockfile, secrets, production infrastructure or UI edit.

### E-8 — Safe runner and user-flow traceability

- node --test scripts/run-flashcard-training-e2e.test.mjs:4/4 passed, proving existing-
  container refusal, guards, scoped reverse cleanup and propagation of failures.
- pnpm docs:user-flows:check:16 validator tests and15 guide mappings passed.
  pnpm user-flow:e2e -- check flashcard-training-backend passed.
- Existing profile/permanent-deletion guides only gained related-feature metadata;
  their browser scenario revisions and rendered behavior did not change.
- New backend/API journey is real executable coverage. Browser/native evidence is
  not applicable to backend-only delivery, not waived for future frontend work.

### E-9 — Versioned design handoff and documentation

- [Canonical copyable prompt](../../../docs/design-prompt/flashcard-training.md)
  exactly equals [v001](designs/flashcard-training/v001.prompt.md), SHA256
  b191553a0de0042cea86525a608c4e04529973742937d7b7d304855ba85e3c0c.
- [DESIGN.md](DESIGN.md) records source base/working-tree scope, immutable provenance,
  Awaiting design, no supplied-design URL/approved implementation target.
  -145 changed-document relative links checked; frozen snapshot links use canonical
  prompt link base. Frontmatter/backlog/ADR indices are factual and synchronized.
- FC-01–FC-09 describe requested future UI, not implemented UI/fidelity evidence.
  No external Magic Patterns write/upload or frontend code was performed.

## Disposable environment and diagnostics

All data was synthetic. Root fixture PostgreSQL17 used loopback55441,
languon_auth_learning_test in an owned tmpfs container; Redis7 used loopback55442/1.
Guard flags explicitly confirmed dedicated non-default loopback test databases.
Registered runner used separate owned ephemeral55445/55446 containers.
No shared/development/staging/production database was reset.

Failed/interrupted exploratory runs are not passing evidence. Under high host load,
default5s HTTP and old30s fixture/60s maximum-import budgets expired; timeout
callbacks continued into later fixtures. Interrupted connection inspection showed
no lingering DB locks. Bounded30s journeys and120s large-fixture setup/teardown/import
budgets preserve every assertion and are not performance-SLA relaxations.
Final dictionary31 passed. Later a lifecycle fixture mixed DB-current timestamps
with a fixed12:00Z mutation clock; crossing noon exposed timestamp-order constraints.
Pinning fixture dictionary/settings dates to the same clock fixed the fixture,
not production behavior; final5 passed without weakening constraints.

## Independent review and residual limits

[REVIEW.md](REVIEW.md) records R1/R2 fixes, initial/narrow review boundaries and
security verdict. The independent completion review passed with no open material
findings. Reverse-proxy logging and live production rollout are outside tested
scope. Session-only revocation uses an admission snapshot; active-user status and
dictionary authority are checked transactionally. Application validation enforces
JSONB/coherence beyond foreign-key defenses. History persists until explicit
content/account purge. Frontend and other exercise modes remain outstanding;
BL-002/BL-003 are not Done.

Final store-test formatting changed its hash from
`ef24cb146b9638d8b9e20bddde8084fc8941a7caf4ceeca6cbd610c16fec209d`
to `5f2c7f7b05c3e2c14c38072f8777829f51b3a7a33d1a9fc269d57db237b36fad`.
Only project Prettier formatting changed; executed assertions and production code
are unchanged, so the 17-test PostgreSQL evidence remains valid.
