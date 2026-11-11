# Evidence: Optional AI diagnostics

Status: Implementation verified; main integration authorized; production/declaration qualification pending

## Reviewed state and integration

Isolated branch `feature/optional-ai-diagnostics` starts at main89ff4193; reviewed source commit5a8958e7 plus final captured fixture/documentation remediations. [Isolated source hashes](evidence/source-state.json) match68changed files. The original checkout retains feature061 and its schemaVersion2 pipeline; source integration commits areb13eb4b7,1c8837a8 and96947eb3. [Integration hashes and reports](evidence/integration-state.json) match51runtime source/configuration files. Guide metadata is validated separately. Main was not changed and no branch was pushed/deleted.

Independent source/completion and security reviews approve the local implementation/evidence with no unresolved material finding; see [REVIEW](REVIEW.md). This is not production deployment approval.

## Acceptance coverage

| Criteria                            | Final proof                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1: No check-history gates         | Real publication, admission, worker/native dispatch with missing/mismatched/failed history; routing5case suite and real SDK success; four browser cases.                          |
| AC2: Optional diagnostics           | 18real-DB probe/runtime cases, explicit browser maximum-expense consent, historical results have no circuit authority.                                                            |
| AC3: Automatic runtime recovery     | Provider/route/flow scope matrix and exact60s expiry; actual401→no-charge failure→immediate rejection beforeHTTP→real61s later SDK completion and settlement without diagnostics. |
| AC4: Actual prerequisites preserved | Shared249assertion union, original16production cases, restricted worker/native authority, owner/MCP/price/tariff/budget/privacy checks, independent security review.              |
| AC5: Doctor/admin/docs              | 108PASS11INFO actual local doctor;48tooling tests;16admin tests; real browser;3current mapped guides; setup CLI10tests.                                                           |
| AC6: Local verification/review      | Exact source/report hashes, real disposable infrastructure, full types/runtime packaging, independent final local approval. Production/declaration exceptions below remain open.  |

## Execution results

| Layer                                      | Result                                                                                                                        | Evidence                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Original full development doctor           | 108PASS,11INFO; exit0                                                                                                         | `/private/tmp/languon-optional-final-doctor.log`                                    |
| Shared routing/accounting                  | 249actual assertions:247unchanged passes+2clean replacements                                                                  | [Exact union](evidence/shared-union.json)                                           |
| Conversation group                         | 254/254pass,0skips, including all11production matrix cases                                                                    | critical run31ddc3c0 ai-conversation.json                                           |
| Original feature061 production integration | 16/16pass,0skips/retries,83.06s                                                                                               | `/private/tmp/optional-diagnostics-integrated-production.json`                      |
| Original mapped preference integration     | 1/1pass,0skips                                                                                                                | `/private/tmp/languon-original-preferences-integration.json`                        |
| Dictionary / text                          | 38/38 and35/35pass,0skips                                                                                                     | critical runbd85458a respective JSON reports                                        |
| Sentence                                   | 57actual assertions:52unchanged passes+5clean replacements                                                                    | [Exact union](evidence/sentence-union.json)                                         |
| Admin routing browser                      | 2/2pass, desktop/narrow and console/network evidence                                                                          | critical runba1981c2 admin-text-ai-routing                                          |
| Clean setup / provider management browser  | 1/1+1/1pass,0skips;178.976s total                                                                                             | critical runf7b0a4c0                                                                |
| Focused doctor/smoke / admin / setup CLI   | 48/48;16/16;10/10pass                                                                                                         | focused logs under `/private/tmp/languon-optional-*`                                |
| Registry safety                            | 23/23pass; original86suite inventory preserved                                                                                | `/private/tmp/languon-optional-original-registry.log`                               |
| Backend/admin types                        | Pass, including final original backend types after preference repair                                                          | `/private/tmp/languon-optional-original-final-typecheck.log`; admin scoped evidence |
| Runtime build                              | All9ESM entrypoints and exact drizzle directory packaging pass463ms                                                           | `/private/tmp/languon-optional-original-runtime-build.log`                          |
| Admin build                                | Pass; existing bundle-size warning                                                                                            | admin worker proof                                                                  |
| Guides/skills                              | 16guide-validator tests/33guides; all3mapping checks; skills10tests/27skills; both external skill validators; setup docs pass | `/private/tmp/languon-optional-final-docs-check.log`, focused skill/setup logs      |

All automated provider execution uses deterministic external HTTP responses; tests retain real application composition, SQL, workers, accounting and persisted results. No paid provider call or live-connectivity claim.

## Exact evidence reuse and remediation

Raw failed aggregate reports are retained and never relabeled green. Durable unions enumerate each covered assertion, original/remediation report hashes, and its evidence source. Unselected cases are explicitly not counted as passes.

- Initial focused policy45cases exposed tariff-only publication overvalidation. Actual credential/price validation was bounded to newly assigned/enabled routes; unchanged delegated tariff-only authority remains. Both affected suites17/17pass; fresh runtime scope suite18/18pass.
- Initial source/security review caught all-fingerprint cooldown scope bypass. Restore provider-wide authentication, route-wide model/transient and route/flow/current-fingerprint schema scope; all expire automatically at60s. Invalid-output/rejected-user-input remain nonexcluding. Cross-flow/sibling-route/other-provider and diagnostic independence are tested.
- Existing CLI/catalog guidance still claimed checks mandatory. Corrected both; existing preview/apply test now asserts optional/no-route-authority wording without changing its no-probe/no-write protections.
- First browser attempts5e86e58c and85ab93c2 stopped before generation because two synthetic worker helpers inherited ignored developer model/budget settings. Explicit curated model and existing bounded five-field test budget now make both helpers self-contained; production loader proof, lint/types and final real journeys pass. Seven-flow attemptba1981c2 supplied valid admin-routing2/2 evidence, then hit the sibling helper before its repair; later unexecuted groups were not counted.
- Dictionary gateway3failures in31ddc3c0 were only the established `identity has changed` substring. Restored it while retaining no-manual-check recovery guidance; focused9/9and final dictionary38/38pass. Identity rejection is unchanged; conversation254passes remain valid.
- Sentence rawbd85458a report has exactly57assertions:52passes and5failures. A complex5-second body watchdog expired; its still-running async work raced subsequent full schema resets and caused4deadlocks. Original exact case passed alone. Change only that case's harness watchdog to30s, matching its neighbor; product timers/assertions unchanged. Clean contiguous5/5sequence passes117.80s;30unselectedcases are not counted. [Exact57-case union](evidence/sentence-union.json) is independently approved; no8-minute unchanged replay required.
- Shared raw6b19ad09 report has249assertions:247passes and2failures,577.41s plus infrastructure. Native overrun failed its30s migration hook and passes unchanged in isolation. Preference fixture omitted `aiCreditEnforcementEnabled:true`; correct production composition therefore denied admission. Explicitly provide it without diagnostic seeding. Keep pre-claim replay equality; after manual claim compare replay to authenticated current running job and assert originalID, exact immutable pin/version and no duplicate admission. Store replay deliberately rereads the persisted job rather than caching queued state. Full mapped journey passes in both worktrees. [Exact249-case union](evidence/shared-union.json) replaces only these2failures.
- Original integration preserves all feature061production cases byte-for-byte and all incident mappings. Extra original cases plus the11diagnostic cases pass16/16. The same mapped preference case passes against original source; final original types pass.

## Local database and cleanup

Doctor first verified exact loopback target `localhost:5432/languon_ai_accounting_dev_20261023` and one pending migration. Used the existing migration runner with explicitly selected ignored local env after target validation; only0165replaces a same-signature dispatch function. No user/accounting DML, reset, routing/key/budget change or provider request. Full final doctor exits0 with108PASS11INFO. Doctor remains prerequisites evidence, not Redis/quota/circuit/provider-connectivity proof.

Standalone PostgreSQL55565 and Redis56565were label/mount verified, then removed with their task-owned anonymous volumes after all tests. Critical runner cleaned its own services. User development services/data and unrelated feature061work were preserved.

## Remaining production/declaration qualification

- Main's release manifest was already stale through0116. Audit0117–0165found49migration files,142function declarations,5top-level data changes, no table/column drops.0138retires an old transcription signature;0144moves/clears private results;0146backfills provenance and clears terminal parent input/source. Current deploy engine migrates before stopping the old slot. Current0165marker/hash and explicit `contract` classification therefore intentionally reject production blue/green release until a separately reviewed maintenance/staged plan plus populated-data compatibility/rollback proof. No deploy engine or historical migration was changed. New0165has no DML. Classifier rejection is a documented blocker, not a passing check.
- Original standard backend build's runtimeJS phase passed229ms; declaration bundling remained active12+minutes. Ownership confirmed and only those processes stopped. Standard build is NOT claimed green. Full final typecheck and the exact9entrypoint runtimeJS plus migration packaging pass; private app declarations are not runtime/library inputs. Earlier isolated standard-build pass is valid only for its captured source. No build config/script changed.
- A genuine shared provider/route cooldown may last up to60s after a key/configuration change. No diagnostic is required for recovery. No paid live-provider connectivity proof is claimed.

These prevent strict feature/release completion and main squash; they do not prevent the requested verified local behavior. M6 remains open.

## Efficiency assessment requested by the user

This could have been substantially faster. The core policy change did not justify the elapsed time; verification, fixture debt and coordination dominated. Timings overlap and should not be added as a wall-clock total.

Necessary risk evidence: real SQL/publication/admission/dispatch without missing/stale/failed diagnostics; cross-provider/flow cooldown scope and automatic recovery; real Free/Paid worker+SDK+settlement/no-charge failure; diagnostic consent; doctor behavior; relevant admin browser; focused static checks and independent review. These caught real cooldown-scope and tariff-only-authority regressions.

Not every test in the broad selections was necessary for this feature's risk. Price actualization/account-erasure suites and much sentence persistence were included by current completion policy rather than changed implementation. critical-workflows.md explicitly mandates the shared routing group; this task followed it. A future reviewed routing-specific selection should retain the security/accounting boundaries above and leave unrelated broad regressions for their own changes or release/scheduled runs.

Avoidable overhead: repeated browser startups from incomplete synthetic env, initial overlapping compilers, late bounded declaration generation, and oversized DB setup. One35-case file applies166migrations36times—up to5,976migration applications before bodySQL. Better: preflight the entire fixture environment once, assign one compiler owner, set time-budget checkpoints, apply the narrowly verified local fix earlier, and reuse unchanged evidence immediately after focused repair. Template/transaction fixture optimization and a narrower completion gate belong in a separate reviewed tooling change; no harness redesign or test weakening was added here.

## Integration disposition — 2026-11-11

User explicitly authorized merging the preserved061/062/063 stack after the key
incident was explained and committed to updating the key. This supersedes earlier
no-main restrictions, without claiming rotation or production qualification is
done. See [feature063 integration decision](../063-dictionary-chat-snippets/EXEC_PLAN.md#integration-disposition--2026-11-11).
Existing approved runtime evidence is unchanged; no deployment/push/deletion.
