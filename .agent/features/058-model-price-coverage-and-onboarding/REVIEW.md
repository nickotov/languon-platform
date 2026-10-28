# Review: Complete provider pricing and model onboarding

Status: Complete — approved for completion.

## Boundary and reviewers

Base `4c41c51`; final 158 changed/new source files excluding the four mutable
feature delivery records. Final scope SHA256:
`849cab6b5b7b9b303d677b06b1af4abefaef1a75286f79e8bddd7cb663f27d1d`.
Independent completion reviewer recomputed the manifest after final execution;
source is unchanged and `git diff --check` is clean.

Initial full-scope review: pricing058_completion_review, with bounded independent
financial and execution/skill subreviews. Remediation mode reviewed each fix and
affected invariant/caller. Review expanded only to required critical harness
budgets after repeated database setup/functional watchdog evidence. Separate
independent tester was required for native financial/SDK/persistence composition;
native_execution_final_tests supplied it. Risk-triggered security reviews:
native_pricing_security, initial and bounded follow-up.

## Security findings — all resolved

| ID / severity     | Location and defect                                                                             | Resolution/evidence                                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-058-01 High   | Native routing admission hash differed from runtime comparison.                                 | Shared resolver applies native identity only to native pins; legacy comparison preserved. Real SDK/router success and stale-worker/credential rejection regressions pass.                                                |
| SEC-058-02 Medium | Reported USD/credits could override tariffs for an unsupported provider.                        | Text, speech and probe SQL bind evidence to immutable provider/price capability. Restricted-worker forgery2, native probe matrix and speech9 cases pass; canonical/migration copies agree.                               |
| SEC-058-03 Medium | Speech observation columns were writable under a forgeable GUC without caller lease comparison. | Checked SECURITY DEFINER entrypoint requires exact live lease and immutable first evidence. Reprovision revokes prior column grants. Null/wrong/expired lease, direct-write/GUC forgery, replay and recovery tests pass. |

Final security follow-up found no new material defect in HTTP scope isolation,
TS/SQL meter/shape/range guards, authoritative deadline horizon, helper privileges
or immutable overflow recovery. Trusted SDK usage is not cryptographic invoice
attestation; live/paid execution was not authorized or performed.

## Completion findings — all resolved

| ID / severity         | Problem and impact                                                                                          | Resolution/evidence                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REV058-ADMIN-01 High  | Native rows displayed legacy Unknown rates.                                                                 | Native-first currency/variant summary and read-only action;4 component cases and3desktop/narrow clean browser journeys pass.                                                             |
| REV058-AUTH-01 High   | Existing HTTP flat writer inherited native write capability.                                                | Explicit native denial, pre-parse64KiB body bound, schema-valid native 400/no-publish and legacy200 tests;4 route cases pass.                                                            |
| REV058-FIN-01 High    | Component/outer-meter mismatch could authorize zero text cost.                                              | Shared contract compatibility/completeness plus independent TS/SQL defense; bypassed-TS persisted mismatch is denied before receipt/HTTP. Explicit all-request tariffs remain supported. |
| REV058-FIN-02 Medium  | Production schedule horizon could contain a later uncovered gap.                                            | Exclusive authoritative action deadline is checked before work; gap denial and covered-transition receipt tests pass. Existing max-card bound already covers price rises.                |
| REV058-FIN-03 Medium  | Huge valid costs could overflow stored bigint and strand immutable settlement.                              | TS/SQL return unknown beyond signed bigint micros, retain raw facts and conservative holds; recovery/parity tests pass without clipping.                                                 |
| REV058-FIN-04 Medium  | Multiplicative per-field limits allowed18MB tariffs and expensive evaluation.                               | 65536 UTF8 bytes,2048 total windows and1024 components; cheap SQL guard and exact parity coverage pass.                                                                                  |
| REV058-EXEC-01 Medium | Native durable evidence covered OpenRouter only.                                                            | Added8DeepSeek/Evo Free/Paid success/failure production SDK/DB cases; all15 text cases pass with persisted result, expense and wallet assertions.                                        |
| REV058-TEST-01 Medium | Five transport cases used an input-only fixture invalid under strengthened contract.                        | Explicit free output rate and production-schema fixture parsing;7focused cases and complete gate pass.                                                                                   |
| REV058-EXEC-02 Medium | Required scenario titles omitted Vitest parameter quotes.                                                   | Exact quoted titles and registry validation corrected; complete gate certifies every named scenario.                                                                                     |
| REV058-EXEC-03 Medium | New native fixture reset/migrate exceeded default 10s setup hook.                                           | Setup-only30s bound; no temporary instrumentation remains.15focused and final full cases pass.                                                                                           |
| REV058-GATE-01 Medium | Expanded gate also exceeded default setup budget in an unchanged suite, skipping4 tests.                    | Backend command uses only hookTimeout30000, no global testTimeout and retry0. Registry15/tooling79 and routing4 pass; final gate has no skipped tests.                                   |
| REV058-GATE-02 Medium | One six-cycle functional circuit regression repeatedly exceeded its default 5s test watchdog under IO load. | Only that test has a bounded 30s watchdog. Body/assertions and production/provider deadlines unchanged; focused case and whole584 case gate pass.                                        |

Author/tester discoveries also corrected the native SQL integer/bigint dispatch
signature, nullable legacy dictionary cost projection, and failed-probe overrun
CHECK. Production dictionary 5 cases retain3000000000 micros and a null obsolete
secondary projection; native probes retain the complete200000 micro expense.

The accounting503 was the existing asynchronous cold-report protocol. Backend
contract is unchanged; exact-period real HTTP fixture warmup requires 200 and only
permits the documented pending response. Browser cleanliness assertions remain
strict. A real DB native 5000000000 micro report materialization regression passes.

## Final verdict and evidence

Approved for completion. No unresolved material correctness, acceptance, security,
architecture, performance or regression finding remains. Final raw run
`232935b2-194d-45a9-9e2a-58eab1283e5a`:45/45 files,584/584 tests,0fail/skip/pending,
no retries. All 13 critical groups/607 cases are independently revalidated through
current registry assertions; admin MCP 3 and speech3 browser journeys pass.
Typecheck, lint, relevant builds, guide, skill and deployment/schema checks pass.

The supplementary account-purge grant-regex release check is still non-green in
byte-identical baseline files. It is outside this feature's completion boundary,
is explicitly preserved/documented, and was not silently waived or changed.

Operational prerequisites remain explicit: Kie Gemini needs a verified broker task
bound for dispatch; retired models do not inherit replacement prices; native
publication requires newly issued scoped actions and matching migrated workers.
No paid/live execution or activation is claimed by the deterministic proof.

Final staged hygiene review covers one removed terminal blank line in derived
migration0114 and its refreshed classification hash. The copy generator was fixed
and the migration regenerated; statement content is unchanged. This nonsemantic
delta updates the source digest above and does not invalidate executed SQL proof.
All raw reports remain untouched. Staged whitespace validation must pass before
local commit.
