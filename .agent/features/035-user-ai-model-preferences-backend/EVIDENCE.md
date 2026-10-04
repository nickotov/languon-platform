# Verification evidence: User AI model preferences backend

Updated: 2026-10-04

## Returned design analysis evidence — 2026-10-04

- Read-only Magic Patterns access identified editor atdgyvrxnwiz1u41sfdgdf,
  provider v6 artifact6bf6dbd3-4522-4a49-a084-09336bd62659. Rechecked active artifact
  after reads; unchanged, generation inactive. Partial source/context export
  (17 nonempty files) and retained-source digest are linked in [DESIGN.md](./DESIGN.md).
- Source-derived Account-only inventory MP-UI-01–10 and MP-01–06/state mappings
  are recorded in [FEATURE.md](./FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04).
  Compared public text-AI contracts, accepted ADRs0016/0017/0026, runtime tokens,
  profile composition, shared Dialog/Popover contracts and Dialog stories.
- Frozen v001 prompt remains unchanged:
  fead9eccb536905a10261c64ec0676f401a0e5c890b2b476621b0ede33bba403.
- Reference web rendering retrieval failed with a response decoding error.
  Connector source remains available; no rendered reference or local UI
  comparison is claimed. Source primitive paths returning empty were not retained
  as empty files. Export is explicitly partial, not runnable verification.
- Documentation/link/hash/diff checks recorded at handoff. No product-code,
  API/schema, prompt snapshot, dependency or external editor mutation; no paid
  models or additional application tests. Existing backend evidence is unchanged.
  BL-005 remains in-progress; frontend implementation/evidence is pending.

## Acceptance coverage

| Acceptance ID | Implementation                                                                        | Evidence                                                          | Result      |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------- |
| AC-1          | Authenticated preference routes, versioned user persistence                           | Service/routes 11 tests; preferences database 8 tests             | Passed      |
| AC-2          | Sanitized shared model catalog                                                        | Contract suite 67 tests; catalog/service checks                   | Passed      |
| AC-3–AC-5     | Per-admission selection, immutable execution snapshots, mixed-worker capability gates | Routing 37 focused tests; deterministic API/worker journey 1 test | Passed      |
| AC-6          | Migration, documentation and regression/review scope                                  | Checks below                                                      | In progress |

## Check records

Base commit: `209e172`. Checks ran on the uncommitted feature branch.
[Author preflight manifest](author-preflight-manifest.json) captures 69 changed
source/config/test files at SHA-256
`ebc6e7524b5c24e3ee84f9c217aef3c81e32918f7c861bcf243c85d1c743c982`.
Documentation and work records are excluded to permit evidence/review updates.
Any source remediation invalidates this digest and requires affected rechecks.

- Backend default suite: 95 files passed, 27 integration files skipped; 679 tests
  passed, 216 skipped. Integration evidence is recorded separately below.
- Shared contracts: 8 files, 67 tests passed.
- Preference service/routes: 11 tests passed.
- Disposable PostgreSQL preference integration: 10 tests passed, including
  optimistic-update races, inactive users, catalog redaction, disabled selection
  retention, stale/legacy readiness and SQL constraints.
- Dictionary selection/routing focused tests: 37 passed after narrowing the pinned
  explicit snapshot to the admitted operation's format.
- Independent tester's real authenticated API + PostgreSQL + Redis journey:
  1/1 passed. Covers preference save/reload/conflict, unavailable selection,
  idempotent replay after preference changes, new Auto selection, and old/new
  worker claim compatibility without model calls.
- Backend and contracts lint/typecheck passed; final backend build including declarations
  passed after the snapshot-format narrowing. Database package build also passed.
- `pnpm db:check` and migration classification (`expand`) passed with additive
  migrations 0041–0044 and current authored 0042 guard hash.
- Raw-SQL guard integration: 1/1 passed after fresh migrations. Exact `23514`
  rejection proves incapable selected claims, immutable snapshot/version/revision,
  and forbidden legacy-to-selected UPDATE; capable store claim preserves selection.
- Account-purge integration: 9/9 passed, including actual deployed restricted-role
  claim/quiescence/finish, model preference deletion, surviving learner data on
  foreign dictionaries, and another user's retained preference. Role content reads
  and preference writes are rejected. This revealed and fixed pre-existing missing
  flashcard/receipt/usage cleanup grants alongside the new preference grants.
- Documentation guide checker: 17 guides passed; checker regression suite 16
  tests passed. Preference/provider/credit mapped guide checks passed.
- Safe preference E2E runner tests: 2 passed.

Database tests use owned disposable PostgreSQL and Redis containers on dedicated
ports, separate databases for API fixtures and existing admin browser journeys,
and explicit safe-target environment variables. Shared development data is not
used. No paid model services are called.

## User-flow evidence

The new preference backend guide maps to its composed deterministic API/worker
journey. Existing provider-management and credit-wallet guides map to existing
browser tests, with revision markers refreshed to reflect selection semantics.
Provider-management Chromium journey passed (1/1, 21.8s) on the final migrations.
Fixtures were aligned with the actual single-card:v2 route capability, live worker
readiness and independently funded credit wallet; no product assertion was
removed. Credit-wallet Chromium journey passed (1/1, 8.1s test). Admin scoped lint and
typecheck passed. Generated web build typing was restored. An initial safe-runner
rejection without explicit dedicated target variables was corrected before
execution.

## Review link

[REVIEW.md](REVIEW.md). Independent completion and security reviews follow
successful author preflight. A separate tester provided the composed journey.

## Remaining gaps

Initial security review passed. Completion review found legacy-observation and
cross-model-circuit gaps (see REVIEW.md). Remediation invalidates the initial source
digest and requires focused regressions, affected static/build checks and refreshed
preflight manifest before scoped completion review. Existing broader evidence
remains valid for untouched behavior.

## Review remediation verification

- F035-REV-001: versioned worker observation IDs and exact identity/capability
  matcher. Real legacy publisher upsert cannot refresh capable evidence. Runtime
  configured formats are recorded; explicit admission requires exact requested
  format and fails for wrong-format workers. Preference database suite 10/10
  passed after fresh migration 0044; text-AI unit suite 19/19 passed.
- F035-REV-002: provider/model/format circuit admission, pre-LIMIT claim filter,
  failure and success all derive from immutable snapshots. Real two-model circuit
  regression plus SQL selection guard: 2 files, 2 tests passed. Proves Kie failures
  do not block DeepSeek, DeepSeek success does not clear Kie, and Auto/explicit
  DeepSeek share their own circuit. Focused routing 37/37 passed.
- Final deterministic preference API/worker journey 1/1 passed on 0044.
- Final provider Chromium journey 1/1 passed (8.0s); final credit Chromium journey
  1/1 passed (8.1s), after resetting only owned public and migration schemas and
  reapplying current history. Admin scoped lint/typecheck passed.
- Final default backend suite: 95 passed files, 27 skipped integration files;
  679 passed tests, 216 skipped. Real integration evidence above is separate.
- Final backend lint, typecheck and build passed. Migration schema check and
  classification passed (`expand`). Formatting was applied after checks without
  semantic changes. Source remediation manifest is recorded separately from
  the preserved initial author-preflight manifest.

[Remediation preflight manifest](remediation-preflight-manifest.json) captures
73 source/config/test files at SHA-256
`6a4c7e9e9f6aadd8d9d03f826811e8bbf4f4a314c856cf58dc1f1ee0b52da67c`.
The preference guide revision is now `sha256:1eb78a4d4c46a816`; its mapped journey
was rerun successfully after revision synchronization. Initial manifest is retained
for review history. Scoped correctness/security follow-up reviews passed against this exact digest.

## Design prompt checkpoint — 2026-10-04

After verified backend036 completion, the detailed profile-model preference prompt
and immutablev001 snapshot are delivered; see [DESIGN.md](./DESIGN.md) and
[canonical prompt](../../../docs/design-prompt/profile-text-ai-preferences.md).
Frontend integration remains awaiting a returned selected design. No external
Magic Patterns generation/publishing was performed.

## Frontend continuation verified — 2026-10-05

Selected v001 integration is complete in [feature 037](../037-sentence-practice-web/FEATURE.md).
Its [evidence](../037-sentence-practice-web/EVIDENCE.md) and
[review](../037-sentence-practice-web/REVIEW.md) supersede earlier frontend-pending
notes without changing this backend's completed status or historic backend proof.
