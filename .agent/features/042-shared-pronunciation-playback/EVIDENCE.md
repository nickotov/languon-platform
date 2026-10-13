# Verification evidence: Shared pronunciation playback and model pricing

Updated: 2026-10-14. Branch: feature/shared-pronunciation-playback; base35534de.

## Acceptance coverage

| Criteria | Implementation and evidence                                                                            | Result                                            |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| AC-1/5   | Saved-source resolver, version/capability guards, visibility policies; E-1/2/5                         | Passed                                            |
| AC-2/3/4 | Normalization, canonical locks, pinned quotes, success-only ledger and DB clocks; E-1/2                | Passed                                            |
| AC-6     | Private S3 delivery, integrity and durable all-version cleanup; E-3/6                                  | Passed locally; live Selectel activation separate |
| AC-7     | Retention/purge participant, actor detachment and audited impact-aware removal; E-2/5                  | Passed                                            |
| AC-8     | Immutable character/token tariffs and API/worker compatibility gates; E-1/2/5/6                        | Passed                                            |
| AC-9     | Single playback coordinator, confirmations/outcomes, cancellation/autoplay and visible surfaces; E-4/5 | Passed                                            |
| AC-10    | Additive schema, migration without synthesis and fail-closed uncertain collisions; E-2/6               | Passed                                            |
| AC-11    | Configuration skill, operations/ADRs, guides and mapped scenarios; E-6/7                               | Passed                                            |
| AC-12    | Author checks, independent security/test/completion reviews                                            | Checks passed; final review verdict in REVIEW.md  |

## Check records

### E-1 — Backend and contracts

- Contracts build; backend lint/typecheck/build pass, including released dist/cli/speech-migration-command.js. Built migration CLI without opt-in refuses before database use as expected.
- Final backend test:109 files/856 tests passed;38 files/332 opt-in tests skipped. Database evidence below covers the feature's material skipped cases.
- Four pricing rollout tests prove staging/production reject admission unless both price API and worker versions1 are declared. Local/test fixture behavior remains available.
- Final source settings fence and migration identity repair were added after the full unit run; affected actual resolver/HTTP and migration PG suites, final lint/typecheck and packaging build reran and passed. No implementation changes afterward.
- Existing unused external document-module imports cause a build warning; build succeeds. No paid provider calls.

### E-2 — Disposable PostgreSQL

PostgreSQL17 on loopback55432, dedicated languon_auth_speech_test, explicit disposable-database consent; real forward migrations0057–0062. Commands use ALLOW_DISPOSABLE_DATABASE_TESTS=true, AUTH_TEST_DATABASE_URL pointed to this isolated database, and exact matching confirmation. Files run serially to avoid reset races.

- shared-speech-store.test.ts:22 passed, including one payer/task, free joins, pinned quotes/rates, deadline/unknown/refund races, database clock backdating protection, deletion and plaintext cleanup, mixed-key rotation, retained-key bind/admin-delete race, duration and immutable cost, and account purge/concurrent completion without debit.
- shared-speech-sources.test.ts:7 passed. Actual owner/shared authorization, hidden/revealed references and checked historical answers; actual resolver→SpeechService→HTTP stale dictionary/settings409, hidden-reference403 and archived-card404 before admission. Both dictionary-stale and dictionary-current/settings-stale variants tested.
- legacy-speech-migration.test.ts:8 passed, without synthesis: ready transfer/checksum/reuse, unresolved task identity, changed defaults, distinct unknown-task/profile collision, unknown/ready collision and equal-internal-UUID/different-provider-task collisions fail before cutover. Original uncertain identities remain for operator reconciliation.
- ai-credit-participant.test.ts:25 passed; model-price-participant.test.ts:1 concurrent-publication/immutability case passed.
- Four account-erasure/legacy-audio store/storage suites:25 passed.
- Total:88 relevant database cases. Exact focused command: pnpm --filter @languon/backend exec vitest run --no-file-parallelism followed by the selected files under tests/integration/modules/speech, tests/integration/database and the four existing account/audio suites. pnpm db:check passes with the disposable DATABASE_URL.

### E-3 — Real isolated MinIO

Private versioned bucket initialization/reinitialization, scoped non-root credentials, upload/read/checksum, two versions/all-version deletion, anonymous403 and unrelated-bucket denial passed against actual disposable MinIO. Test project removed afterward. This proves local S3 protocol, not live Selectel.

### E-4 — Frontend author checks

- Web final production build, then sequential typecheck, lint and diff checks pass. Prior full561/561 passed; two added source-factory regressions pass. Latest full563 invocation:562 passed and one unchanged document-generation case timed out under concurrent browser/build load. Entire affected file passed independently4/4 in788ms test time. All563 cases have passing evidence; the latest full invocation itself is not represented as clean.
- Admin43 tests, lint/typecheck/build pass; existing bundle-size warning retained.
- Mobile typecheck passes as a shared-contract consumer; native playback implementation is outside scope.

### E-5 — Actual browsers

Chromium against dedicated loopback API/web/admin processes, independently isolated PostgreSQL databases and Redis56379, deterministic fixture speech. No API mocks replace generation, credits, byte delivery or authorization. Audio bytes/checksums observed with passive browser fetch-clone probes where CDP returned an empty response body.

- Eleven unique web scenarios passed: four dictionary field/reuse/edit/failure-stop/revocation journeys; normalized cross-account reuse, paid quote/cancel, finite-wallet successful settlement/free replay and unsupported Hebrew with playable English; visible flashcard front/back, anonymous-hidden controls, and sentence prompt/revealed-reference/library/checked-answer/completed-result/history playback.
- Latest full dictionary/shared8 passed after the first revision fix; all four dictionary scenarios reran successfully after the final mixed-freshness settings fence (3.1m), asserting both request revision guards. Focused factory/API7 tests also pass.
- Three admin journeys passed28.1s: protected private WAV preview/no-store, reason validation, changed binding impact409/reload, audited physical removal/text scrub and subsequent404; inventory filters; two actual sessions publish tariff200/stale409 and recover. Desktop and390px layouts/screenshots, no unexpected post-login console/request failures.
- Web narrow390x844 covered. Total14 unique browser journeys. The repeated post-fix runs are not double-counted.
- Runtime repairs found during verification: bounded approved-origin OPTIONS; canonical parsed source-key identity; completed-round speech controls; namespaced admin form IDs. All retain regression proof.

### E-6 — Infrastructure, grants and skill

- Deployment suite78 passed/6 optional skips; focused rotation15 passed.
- Separate real PostgreSQL temporary-role proof passed exact worker/purger scripts: ready-text/audio erasure and immutable identity/storage mutation denied; approved deleting-state cleanup succeeds; narrow payer/association/ledger operations; no retained-text/pricing escalation. ROLLBACK verified zero roles/fixtures. Subsequent queue/duration/cost SQL guards leave grants unchanged and have real core PG proof.
- Agent-skill validator passes22 packages; speech model configuration skill passes isolated validator. Dev-panel52 tests passed; existing visible descriptions restored, only reviewed dev-infra source hash changed.
- Full panel catalog check reports pre-existing check/test/source-search/styles/other-E2E drift and newly unreviewed speech:migrate/test:e2e:shared-pronunciation scripts. Those scripts remain disabled in the panel by its existing safety boundary; direct guarded documented commands work. No panel command was enabled to bypass review, and no full pnpm check claim is made.

### E-7 — Guides and preflight

- pnpm docs:user-flows:check:16 tests plus21 indexed guide/mapping checks pass.
- pnpm user-flow:e2e -- check shared-pronunciation-playback and dictionary-pronunciation-audio pass. Shared guide maps10 feature scenarios across four files; dictionary guide maps its four existing cases. Current guides verified2026-10-14; older unchanged mapped journeys retain baseline dates with new shared proof references.
- Reviewed composite runner selects shared, owner/anonymous flashcard, owner/reader sentence and admin cases with deterministic sentence fixture services. Operations describe source/built migration commands, explicit opt-in/drain, uncertain collision reconciliation, rotation and version gates.
- Final whitespace and affected formatting checks, web styling contract and9 FSD boundary tests pass. Generated next-env.d.ts restored; ignored runtime artifacts excluded. No lockfile changes, credentials, unrelated refactors or unresolved conflicts.

## Boundaries and cleanup

Live activation requires Kie connectivity/credentials/languages/voices/quality, provider commercial terms/caching/pricing, and Selectel private versioned bucket/scoped IAM/checksum/all-version deletion evidence. Generation remains disabled until these documented gates pass. No paid generation or production provisioning was performed; fixture tones prove lifecycle/accounting, not pronunciation.

Approved successful normalized text/audio retention and authenticated exact-text cache-membership inference include private saved text. Learners cannot enumerate the cache or obtain origin/payer/source, canonical keys or object URLs. Retained text can itself contain personal information; retention is not anonymization. Already admitted work can finish after deletion with payer links/holds erased and no late debit. Rotation requires every active/rollback node to know the complete retained-key set.

Cleanup completed: feature-owned PostgreSQL/Redis containers and anonymous volumes removed; dedicated browser-test ports have no listeners. Ordinary development PostgreSQL5432/Redis6379 services and volumes preserved. Review verdict and patch boundary: REVIEW.md.
