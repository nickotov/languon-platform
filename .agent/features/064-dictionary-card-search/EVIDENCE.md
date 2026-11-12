# Evidence: Reliable dictionary card search

Status: Complete — selected checks and independent evidence review approved

Baseline: main9b8b4eaa; clean checkout before feature initialization.
Authority: user approved full bug fix including PostgreSQL index migration.

Source-confirmed before edits: raw search in query keys, whole-editor loading
replacement, whole-word tsquery and missing exampleTranslation index field.
No runtime/model/paid calls or user-content deletions. The approved local index
migration was applied after disposable proof (E4).

## E1 — Frontend regression

Original input-focus/debounce assertions failed against the original code
(`/tmp/feature064-web-search-red.log`). Final implementation:

```sh
pnpm --filter @languon/web exec vitest run tests/dictionary-card-search.test.tsx tests/dictionary-deletion-selection.test.ts tests/dictionary-card-auto-save-coordination.test.ts tests/library-navigation.test.tsx --maxWorkers=1 --no-file-parallelism
```

Final pass: 4 files / 20 tests, 6.57s (log:
/private/tmp/languon-dictionary-search-web-final.log). The six new tests exercise the real editor/controller
and TanStack Query, mocking external API transport only. They prove300ms latest
trimmed debounce, whitespace equivalence, stable same input/focus/caret through
pending/error/retry/clear, new/cached filter page reset, abort/late-response
isolation, archive/selection safety and one navigation-open write through search
and clear. The latter reproduced two writes before remediation
(/private/tmp/languon-dictionary-search-navigation-red.log) and now stays at one.
The source filenames are the patch boundary
from main9b8b4eaa; final content hashes will be retained before handoff.

## E2 — PostgreSQL prefix/migration/performance

```sh
pnpm test:e2e:critical -- --flow dictionary-card-search-store
```

Original-query RED: run78006d99-1074-46d2-980d-2cde7a6a8f98, three actual prefix/new
filter assertion failures, no setup failure (7.8s). The first ad-hoc unregistered
selector was rejected safely before tests and is not regression proof.

Final strengthened run254d3898-133b-4aa8-ba63-8ec93c2465e7:5passed/0skips/0retries.
Summary: test-results/critical-flows/254d3898-133b-4aa8-ba63-8ec93c2465e7/summary.json;
raw log:/private/tmp/languon-dictionary-search-db-final.log.
Total7.976s: shared build438ms, owned setup1596ms, execution4951ms,
cleanup986ms. Vitest bodies2191ms. Dedicated loopback PG55489/Redis56489,
database languon_auth_execution_critical_test; runner cleaned its containers and
volumes. Normal developer DB5432 was never reset.

Proof covers five stored fields, case/Unicode/apostrophes, literal punctuation,
AND-prefix semantics, punctuation-only input, owner/lifecycle/cursor isolation
and new filter finding a previously unloaded card. Migration fixture recreates
the prior four-field index on representative existing content, executes the
exact generated0168 SQL, checks full row equality and new translated-example
readback, then reruns the migration runner idempotently. No down migration is
part of the established append-only strategy; prior-index recreation followed
by forward application verifies reversible physical index replacement safely.

At10,000target+250other-owner cards, EXPLAIN ANALYZE BUFFERS uses production-equivalent
SELECT*, dictionary/lifecycle filters, ordering and limit51. Common, rare, missing
and one-character prefixes used dictionary_cards_search_idx in this fixture.
Real store common/rare calls returned50/1rows in10.0/4.3ms respectively. These are
local bounded-query observations, not throughput/SLA guarantees for many users.
No entire dictionary client fetch, fuzzy/leading-wildcard search or new extension.

## E3 — Generated schema and static checks

`pnpm db:generate` produced0168_faulty_thunderbird.sql, snapshot and journal entry;
only the GIN index is replaced, no card table/content/API change. No generated
file was hand-edited. `pnpm db:check`, web/backend typecheck and web styles check
passed. Remaining final scoped lint/types/docs/browser results will be recorded
after the journey fixture and reviews stabilize.

## E4 — Local development activation

Safely resolved configured target without printing credentials:
APP_ENV=development, localhost:5432/languon_ai_accounting_dev_20261023,
no MIGRATION_DATABASE_URL override. `pnpm db:migrate` exited0 after the disposable
proof and focused SQL/security source review. Log:
/private/tmp/languon-dictionary-search-dev-migration.log. This normal application
migration replaces only the search index; no reset, deletion or content rewrite.
Read-only pg_indexes confirmation found the index with example_translation after
application. No env changes required. Existing dev watchers can reload code; user services
were not stopped/restarted. Production migration timing/deployment is untested.

## E5 — Real browser and guide

```sh
pnpm test:e2e:critical -- --flow dictionary-card-search
```

Final run72855dfc-5134-408a-bf79-8748654940d7 passes1test/0skips/0retries. Report:
test-results/critical-flows/72855dfc-5134-408a-bf79-8748654940d7/dictionary-card-search.json.
Total28.915s: build398ms, owned setup1636ms, execution25836ms, cleanup1041ms;
test body9.5s. Real Chromium via project-pinned Playwright, synthetic signup,
real backend+PostgreSQL, no application mocks/provider calls. Owned loopback
web3435/backend4435/PG55485/Redis56485, database
languon_admin_e2e_critical_test; no existing-server reuse, runner cleanup passed.

Stable scenario dictionary-platform/owner-searches-cards-without-losing-focus
proves continuous keyboard input, onlybon request for three-character burst,
bounded limit50/no cursor, actual result card IDs independently across all five
fields (example omits Bonjour, so bon matches Source only), exactly one page-open
POST throughout all searches, no-match
and clear, preserved focus throughout. Desktop1280x900 and narrow390x844 rendered
screenshots inspected: visible focus, usable toolbar/results and no page overflow.
Console/page errors and unexpected HTTP>=400 are asserted absent. Report attachment
names dictionary-search-desktop and dictionary-search-narrow retain captures.
This mapped real-app proof satisfies ADR0016 without duplicate exploratory sessions.

Existing dictionary-platform guide updated with prefix/debounce/loading/error/
pagination behavior and stable scenario; revision sha256:030f8261e4e687ef.
Unchanged authoring/AI/import scenarios were reviewed for traceability but not
rerun; their older last_verified date remains rather than claiming a full-guide
rerun. `pnpm user-flow:e2e -- check dictionary-platform` passes.
`pnpm docs:user-flows:check` passes16validator tests and34guides.

## E6 — Final static/tooling boundary and selection

`pnpm --filter @languon/backend typecheck` and
`pnpm --filter @languon/web typecheck` pass on final source/tests. Scoped ESLint,
Prettier and `git diff --check` pass. `pnpm --filter @languon/web styles:check`
passes. `node --test scripts/critical-flows/registry.test.mjs` passes25tests,
including exact independent search/browser selectors, existing AI aggregate
selection, safe ports, minimum counts and no skipped/retried evidence. Existing
aggregate now subsumes only AI seams, retaining the independent store flow in
comprehensive selection. Browser command discovery selects exactly one new case.

Final source/test/migration/tooling patch fingerprint from main9b8b4eaa:
SHA256 4db6d831e724c6f0df7d287f8ebc1d0950cc9301cfe781bc263b8079271ebf94
(18 sorted changed tracked/untracked apps/ and scripts/ files, hashing path,
NUL, bytes, NUL). Subsequent delivery-record/prose edits do not alter this state.
Backend/store proof remains valid: no backend/runtime/migration/test behavior
changed after E2. The navigation fix invalidated initial browser run
a072eabc-8882-4d04-947a-9aa5c44b509d; the final run above supersedes it. Focused
frontend tests and web typecheck were rerun after the fix, including the existing
navigation hook suite. No further runtime changes followed.

No full monorepo, catalog build or AI regression matrix: no shared primitive,
package export, AI/auth/accounting/worker change. Real database tests execute the
backend source; real Next browser run compiles affected UI, with final types and
style/lint checks covering authoring. No new framework/build asset contract.

| Acceptance | Evidence                                                                   |
| ---------- | -------------------------------------------------------------------------- |
| AC1        | E1 stable input/caret/error; E5 desktop+narrow keyboard focus              |
| AC2        | E2 five-field literal/Unicode prefix; E5 actual HTTP/UI IDs                |
| AC3        | E1 exact300ms/trim/cancellation; E5 onebon request                         |
| AC4        | E1 page/cache/selection races; E2 owner/lifecycle/cursor                   |
| AC5        | E2 existing-row forward/idempotency; E3 generated SQL; E4 local activation |
| AC6        | E2 actual10k plans/store counts and bounded latency observations           |
| AC7        | E5 mapped browser/guide; E6 gates; REVIEW approved final verdict           |

## Remaining limits

No paid/live AI proof needed or performed. Sustained multi-user throughput and
production index-rebuild write-block duration are not established; see REVIEW.
No new server-side search rate policy is implied by client debounce. No known
implementation failure or required verification gap. Independent final evidence
approval covers AC1–AC7 on the recorded final fingerprint; see REVIEW.
