# Evidence: Sentence library management and preparation

Status: Complete — backend and returned-design frontend verified.
Date: 2026-10-06. Source and prompt hashes: [manifest](./evidence/backend-manifest.json).

## Automated and real infrastructure verification

- Shared contracts: 90 tests passed; lint/typecheck/build passed.
- Backend deterministic suite: 103 files / 823 tests passed. 34 files / 292 guarded
  tests skipped without infrastructure opt-ins; these skips are not DB evidence.
- Final dedicated database bundle: **5 files / 56 tests passed in 42.15s**.
  [Captured log](./evidence/backend-final-db.txt). This includes 16 preparation
  cases, six adversarial library cases, restricted worker, admin and purger tests.
- Maintained `pnpm test:e2e:sentence-practice-backend`: **2/2 passed in 8.79s**
  on final remediated source. [Captured log](./evidence/backend-final-api.txt).
  Guide revision: `sha256:bf3394d7a0503c39`.
- Additional composed learning/sentence/purger bundle: 3 files / 14 tests passed.
- Focused library HTTP: nine tests passed; worker/policy/publication: 40 passed.
- Backend lint/typecheck/build passed. Web/admin typechecks passed after contract
  changes; no new frontend implementation was included.
- All 19 user-flow guides and backend mapped-coverage validation passed.
- Formatting for affected files and `git diff --check` passed.

The final database command uses the approved synthetic environment and executes:

```sh
pnpm --filter @languon/backend exec vitest run \
  tests/integration/modules/learning/sentence-library-preparation.integration.test.ts \
  tests/integration/modules/learning/sentence-library-safety.integration.test.ts \
  tests/integration/modules/learning/infrastructure/sentence-worker-role.test.ts \
  tests/integration/database/administration-store.test.ts \
  tests/integration/modules/users/infrastructure/drizzle-account-purge-store.test.ts \
  --fileParallelism=false
```

Both opt-ins and exact confirmations point only to task-owned loopback containers:
PostgreSQL 55491 / `languon_auth_sentence_library_test`; Redis 56391 / DB14.
Files run serially because their reset harness shares this disposable schema.
Normal user development data and paid/nondeterministic providers were not used.
An initial combined run used an incorrect Redis confirmation. Its affected
composed targets were rerun with the exact host/port/database confirmation and
passed; that setup failure was not treated as product or successful-run evidence.

## Important established invariants

- Personal archive isolation, global exclusion, restore, and no preview exposure.
- Stable bulk selection/receipt replay and content-aware stale rejection after
  card edits and dictionary-language changes.
- Creator-archived-only permanent deletion; unsettled checks block purge;
  associated content is removed and permitted credit reservations remain.
- Actual two-transaction lock-order proof for delete versus admission.
- Concurrent snapshot retention at five per dictionary / 25 per actor, bounded
  100-row expiry cleanup and rejection above 10,000 selected examples.
- Preparation above 100 words, discovery/practice of partition two, one active
  child, no preparation exposure or implicit generation on prepared practice.
- Stop settles the admitted child; real wallet exhaustion pauses without creating
  a reservation; only explicit resume after replenishment admits one child.
- Completed snapshots become stale after word changes. Saved reuse persists a
  100-row scan cursor and reaches later eligible saved content without new charges.
- Preparation content quota, protected resumable pauses, bounded seven-day cleanup,
  operation replay after expiry and sharing-digest-free tombstones.
- A blocked preparation start leaves the global capacity lock available; inactive
  cleanup still runs with another learner's active queue.
- Restricted worker can prepare/reserve/publish and prune expiry, while raw
  confirmation content and unrelated writes remain denied. Restricted purger
  erases new content/visibility data without reading copied words/raw job inputs.
- Live admin recent-authentication/membership checks and atomic audit rollback.

## Review and design checkpoint

Independent completion and security reviewers approved the backend after narrow
remediation. [REVIEW.md](./REVIEW.md) retains the initial findings, closure and
accepted low worker-compromise hardening residual.

Two detailed portable prompts are saved and frozen as v001 in
[DESIGN.md](./DESIGN.md). They cover all supplied controls, material states,
responsive behavior and recovery without concrete API paths. No generated design
is available yet; no implementation target is selected. New web/admin browser
journeys, source-to-runtime fidelity and whole-feature completion remain for the
returned-design stage.

Cleanup: the task-owned PostgreSQL and Redis containers were removed after the
final checks. Normal development infrastructure was left intact.

## Returned-design frontend evidence — 2026-10-07

Selected learner source is Magic Patterns artifact
`e4a89692-97c6-4fc0-8967-9ca6e8ecc40b`: all 37 frozen file hashes remain
verified, manifest SHA-256
`03011dfd23f3cf6e93a30076d0de4de2a1fe67e58a86ea4bb8ce654960b7a5b7`.
[Fidelity inventory and captures](./designs/sentence-library-and-preparation/v001/evidence/FIDELITY.md)
record source-to-runtime mapping and justified contract adaptations. The provider
returned source, not reference screenshots; no pixel-perfect comparison is claimed.
[Admin composition evidence](./designs/admin-sentence-library-management/v001/evidence/COMPOSITION.md)
records the separately authorized local design with existing theme primitives.

Author preflight on the frontend candidate since backend checkpoint d74fbbd:

- Web lint/typecheck passed; Vitest 53 files / **494 tests passed**.
- Admin lint/typecheck passed; Vitest 5 files / **31 tests passed**.
- Admin Vite production build passed; existing large-chunk warning remains.
- Frontend architecture 9/9 passed.
- Documentation checker 16/16 and all 19 guides passed; both affected browser-guide
  mapping checks passed (sentence-practice-web / admin-user-management).
- Final full sentence-practice browser suite **9/9 passed in 3.1 minutes**.
  Required existing owner flashcard journey **1/1 passed in 10 seconds**.
- No unexpected web browser errors or failed requests. One deliberate
  blocked list request proves transport recovery. Rare preparation alerts use
  schema-valid GET presentation overrides after the real manifest/reconnect
  journey; they do not claim simulated backend failures as business proof.

Browser commands use the existing project Playwright configurations, disposable
PostgreSQL 55491 and Redis 56391 with explicit test opt-ins, loopback origins
(web 33491/backend 40491; admin 30491/web 33492/backend 40492), synthetic users
and deterministic worker usage. No paid provider or normal development data.
Web guide revision: `sha256:be2af6f72f9b5ae8`; admin:
`sha256:8f1ff6e6a88850b6`.

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/sentence-practice.journeys.spec.ts
pnpm --filter @languon/web exec playwright test tests/e2e/flashcard-training.journeys.spec.ts --grep 'owner configures'
pnpm --filter @languon/admin exec playwright test tests/e2e/admin-user-management.journeys.spec.ts
```

The maintained fake-worker harness publishes real capability observations and
processes durable preparations through the real services. Guarded test-only policy
allows its deterministic credential substitute; production routing is unchanged.
Admission/settlement and admin mutation assertions use real disposable database
state, not UI-only success messages. An independent non-harness author reviewed
the harness guards; the E2E specialist independently reviewed production code.

Final web production build (`pnpm --filter @languon/web build`, webpack) passed:
compilation 6.1s, TypeScript 5.6s, static generation and route collection complete.
Owner/shared sentence-library and example-preview routes are present.

Final admin full browser suite **9/9 passed in 1.2 minutes**, including reasoned
personal/global mutations, guarded deletion, actual credit settlement, provider
revision pinning, user lifecycle and passkey authentication. Strict error/request
observers passed. An inherited warning-level Ant/Vite circular-reference notice
in the existing provider form is not an error; no product regression was found.
Focused preparation evidence recovery also passed **1/1 in 35 seconds**, preserving
all eight rare-state captures after the successful full run. Maintained old
harness selectors/catalog-price assumptions were corrected to current real UI
and exact database assertions; production pricing or security policy was unchanged.

Independent frontend completion/security reviewer approved the final candidate.
Backend production remains d74fbbd; its prior real database/API and security proof
is reused without claiming the presentation overrides as backend evidence.

Final frontend candidate: [source/test manifest](./evidence/frontend-manifest.json),
aggregate SHA-256 `1e84f5693b129dac46488f7c6f7d4203ece21d0b7ad331627b214ca14ab2acac` (76 files since backend checkpoint).
Sanitized admin business/viewport summaries are retained beside the manifest;
primary preview captures use viewport screenshots to avoid full-page backdrop
distortion. Optional capture rerun passed 1/1 in 28.5s.

Cleanup: all test application/worker processes exited. Only task-owned
`languon-sentence-ui-pg` and `languon-sentence-ui-redis` were removed with their
disposable volumes. Normal development infrastructure remains untouched.
Generated Next declarations restored; no traces, authentication headers, paid
provider calls or generated build output included in the feature diff.

Final authored diff/format checks pass. The immutable provider export is excluded
from whitespace normalization: its original extra trailing blank lines are
retained and verified by the frozen source hashes. The staged whitespace check
excludes only that source-export directory; application/tests/docs remain checked.
