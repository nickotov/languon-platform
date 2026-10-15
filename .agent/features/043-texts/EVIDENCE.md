# Verification evidence: Texts backend checkpoint

Updated: 2026-10-15. Backend scope AC-01–AC-08; frontend AC-10 is deferred.

## Acceptance coverage

| Acceptance | Implementation                                                              | Evidence   | Status                 |
| ---------- | --------------------------------------------------------------------------- | ---------- | ---------------------- |
| AC-01/03   | Typed contracts, content service/store, optimistic save and pair provenance | E1, E2, E6 | Passed                 |
| AC-02      | Source segmentation, provider output validation, durable proposals          | E1, E3, E6 | Passed                 |
| AC-04/05   | Context selection and atomic dictionary publication                         | E1, E4, E6 | Passed                 |
| AC-06      | Capability shares, active-source checks, independent copies                 | E2, E4, E6 | Passed                 |
| AC-07      | Worker/admission/credits/purge/SQL guards and restricted roles              | E3–E5      | Passed                 |
| AC-08      | Migration, regression, API and static verification                          | E1–E7      | Passed; review closed  |
| AC-09      | Prompt and versioned handoff                                                | E8         | Saved; awaiting design |
| AC-10      | Web design implementation                                                   | Deferred   | Await user design      |

## Tested state and environment

Base: `664198fee9eb1a0492134c43de9a9d04835568af`, branch `feature/texts`.
Uncommitted source identity is captured in `backend-preflight.sha256` (paths include
new/untracked files). Subsequent remediation records must identify changed files
and affected reruns. No evidence relies on HEAD alone.

Dedicated Docker PostgreSQL17 (`languon-texts-postgres-test`, loopback55443) and
Redis8 (`languon-texts-redis-test`, loopback56443) only. Each suite has an exclusive
`languon_auth_texts_<area>_test` database; journey uses `languon_auth_texts_test`.
Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, `AUTH_TEST_DATABASE_URL` to that
local disposable URL, `AUTH_TEST_DATABASE_CONFIRM` to the exact database name.
Redis journeys also set `ALLOW_DISPOSABLE_REDIS_TESTS=true`,
`AUTH_TEST_REDIS_URL=redis://127.0.0.1:56443/1` and matching
`AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56443/1`. All data synthetic. Deterministic
providers, no paid AI. Fixtures close clients/reset only guarded dedicated targets.

## Check records

### E1 — Contracts, domain, workers and affected static checks

- `pnpm --filter @languon/contracts test`: 97 tests passed.
- `pnpm --filter @languon/backend exec vitest run tests/unit`: 114 files,
  946 tests passed (34.42s). Includes new domain9, AI17, selection7 and shared
  runtime/admission regression coverage; no integration skips presented as proof.
- Contracts build/typecheck/scoped lint and prompts build passed.
- Backend `typecheck` and `build` passed (ESM plus declarations).
- Backend lint initially found one prefer-const in new runtime test; fixed and
  affected lint rerun. Final root records below supersede intermediate checks.

### E2 — Content persistence and migration

Run `pnpm --filter @languon/backend exec vitest run` with each indicated path:

- `tests/integration/modules/texts/infrastructure/text-content-store.test.ts`:
  11 passed after SEC-TEXTS-01 remediation; active ownership, draft/save/edit provenance, optimistic versions,
  live sharing, independent copies, lifecycle and idempotency. Database area content.
- `tests/integration/modules/texts/texts-migrations.test.ts`: 2 passed;
  upgrades pre-Texts schema0062 with existing user data, reruns safely and installs
  fresh through0067. Database area upgrade. Final SQL rerun recorded below.
- Migrations are additive. Runtime rollback disables new admissions; do not drop
  new user content as a rollback. No destructive down migration executed/promised.

### E3 — Durable AI lifecycle and settlement

`pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-job-store.test.ts`:
8 passed on area jobs (46s). Initial account policy, exact JSONB source alignment,
measured credit settlement, concurrent admission winner, lease recovery/fencing,
immutable snapshots, estimated-to-reported usage, cancellation, deletion before/after
dispatch, stale document and105-row expiry cleanup. Units validate full-input
preflight, malformed output, safe HTTP errors and advisory detection.

### E4 — Selection publication and restricted worker

`pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/text-selection.test.ts`:
10 passed on area selection. Actual dictionary-worker role publishes a card/new
dictionary from a foreign shared text; attempts to mutate share secret/version,
account/pricing fail. Covers revocation during dispatch, concurrent dictionary
version publication (one winner), deletion quiescence, cancellation, rate-limit
retry with per-attempt capacity and unknown-dispatch fencing. Selection units7 pass.

### E5 — Shared accounting and account erasure

- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/text-ai/text-ai-capacity.test.ts`:
  11 passed on area shared, all three new kinds counted, archives included,
  old-worker capacity guard, concurrent admission and drain.
- Existing AI-credit integration suites: 24 passed on area shared after new guards.
- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-account-purge.test.ts tests/integration/modules/users/infrastructure/drizzle-account-purge-store.test.ts`:
  11 passed on area purge. Owned/foreign cancellation, credit blocking, numeric-only
  archives, restricted role denying raw context access, preserve independent foreign
  copies/cards, detach receipts and complete user tombstone.

### E6 — Registered real API journeys

`node scripts/run-texts-e2e.mjs`: 5 passed against real authentication/Hono,
PostgreSQL/Redis, actual configuration/credits and deterministic providers.

- `texts/owner-translates-edits-and-collects`: create draft, generate proposal,
  explicit save, edit provenance, concurrent identical collection admission,
  one durable job and one dictionary/card.
- `texts/shared-reading-copy-and-revocation`: anonymous capability read, independent
  copy, revocation and public security headers.
- Expiry cleanup of205 jobs in three batches retains safe receipts and scrubs raw data.
- `node --test scripts/run-texts-e2e.test.mjs`: 2 passed; rejects unsafe environment.
- Guide: [texts](../../../docs/user-flows/texts.md); mapped test
  `apps/backend/tests/integration/modules/texts/texts.journeys.test.ts`.
  Final revision synchronization and refreshed run recorded below.

### E7 — Author preflight/final checks

- Final additive migration upgrade/fresh/rerun suite2/2 passed against current0064–0067.
- Full backend lint and final typecheck passed. Final backend build passed ESM/DTS.
- After remediation, focused backend worker/Text domain/AI HTTP units35/35 passed.
- Prompts5/5 tests and prompts/contracts typechecks passed; web/admin consumer
  typechecks passed. No frontend source changed.
- After middleware remediation, real composed-app runner5/5 passed09:58:10UTC:
  existing profile/dictionary PATCH preflight, new PUT/DELETE/shared headers,
  disallowed origins,17k ASCII and20k Unicode texts, no selection-rate leakage.
- `pnpm user-flow:e2e -- check texts` passed for revision
  `sha256:c8f5974b7526256f`; `pnpm docs:user-flows:check` passed16 checker tests
  and22 guides. Journey marker-only synchronization followed semantic review.
- Initial and bounded remediation reviews approved; all findings closed in
  [REVIEW.md](REVIEW.md), with independent report hashes/locations.
- Backend verified manifest [backend-verified.sha256](backend-verified.sha256),
  SHA-256 `afa35be15d878b4bd4c617159ef9b45807ff1fee6a7522fb55189da54faa2e0c`.
  This supersedes preflight for repaired routes/resolver/tests. No backend source
  changes followed this manifest.

### E8 — Design handoff

[Canonical prompt](../../../docs/design-prompt/texts.md) saved after backend
approval; [DESIGN.md](DESIGN.md) records complete immutable v001/v002 snapshots/hashes,
source manifest, references and no selected implementation target. TXT-01–TXT-28
map all required desktop/mobile flows, semantics and recovery states. Current
app shell, dictionary surfaces, UI primitives and runtime tokens were inspected.
No generated design exists yet. Final formatting/diff/snapshot checks recorded in
ExecPlan before the local checkpoint commit.

## Limits and remaining work

No UI exists yet and no browser/device/design fidelity is claimed. No production
migration, activation, deployment or paid provider was exercised. AI admissions
remain default-off until existing release/configuration/worker compatibility gates
are deliberately activated. 20,000-code-point input cap does not imply every model
can translate that size; complete-input/output preflight may require a shorter text
or larger-capacity model. Independent review is approved and the design prompt is saved. Frontend waits for
the returned Magic Patterns design; the overall feature is not complete.

Final handoff: all changed-file formatting and `git diff --check` pass. Contracts/
prompts lint pass. Canonical prompt equals frozen v002 byte-for-byte, SHA-256
`093fe7e224bde2764dd26f786a297c465b9259e746343677524f96f121325c64`.
All95 verified backend hashes still match. The two dedicated labelled test
containers were removed after checks; development containers were untouched.
