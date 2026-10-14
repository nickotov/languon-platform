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

## E-7 — Existing-schema migration repair (2026-10-14)

The user reported PostgreSQL 55P04 during `dev:all`: migration 0057 used newly
added labels of an existing enum inside CHECK constraints before commit. The
previous fresh-install migration evidence did not establish upgrade compatibility.
A disposable database at migration 0056 reproduced the same failure with the old
runner. Canonical SQL, journal metadata, hashes, and timestamps remain unchanged.

- Final PostgreSQL 17 migration integration suite: **16/16 passed** on the
  feature-owned disposable database at localhost:55432, fake data only. Coverage:
  fresh schema, actual 0056 upgrade preserving saved users/dictionaries and credit
  accounts/grants plus the applied ledger, idempotence, older learning upgrade,
  ordinary-DDL rollback and additive-label retry, concurrent advisory lock,
  tampered history rejection, wrong placement/append order, fresh duplicate labels,
  existing-type duplicate additions rejected before mutation, multiple append
  retries, same-anchor BEFORE/AFTER statement drift and valid retries, and partial
  precommit residue rejected before ordinary schema/history writes.
- Database package: five unit tests, ESLint, TypeScript, ESM/declaration build passed.
  Backend TypeScript, build, and scoped integration-test ESLint passed.
- Prettier, `git diff --check`, and `pnpm docs:user-flows:check` passed. No learner
  UI or public journey changed; existing commands and expected guide behavior stay
  the same, so browser/mobile journey evidence from the feature remains applicable.
- The actual migration target was safely verified as development localhost:5432
  without printing credentials or reading private rows. `pnpm db:migrate` completed
  successfully and repeated successfully using the final runner. No reset, ledger
  modification, or user-data inspection was performed. Initial sandbox tsx IPC
  restriction was resolved using authorized local execution.

ADR-0033 records that failed ordinary migrations can leave unused additive enum
labels, with schema/data/history transaction rollback and validated retries.
Independent completion and focused security remediation verdicts are in REVIEW.md.

The feature-owned PostgreSQL regression container and anonymous volume were removed
after the final 16-case suite. Existing development PostgreSQL/Redis were preserved.

## E-8 — Playback controls and fixture isolation repair (2026-10-14)

User-reported regressions: verbose play controls, playback beside example fields,
and a beep for French `alarmer`. Discovery safely verified `.env.local` selected
fixture with no Kie configuration; the fixture deliberately synthesizes a WAV tone.

- Backend: **30 real PostgreSQL store cases + seven policy units passed**. Eight
  new cases cover fixture/live ready-cache exclusion in both directions, legacy
  and scoped keys, pending-job separation, and approved legacy live reuse when new
  model support is absent. Existing normalized cross-account reuse and credit/race
  cases passed. Fake synthesis only; strict persistence guards remain enabled.
  Disposable PostgreSQL localhost:55432 / `languon_auth_playback_controls_test`;
  owned container/anonymous volume removed, normal dev infrastructure preserved.
- Web: early full suite **63 files / 567 tests passed**; final focused three files /
  **19 tests passed**, including actual shared-page composition, two dictionary
  actions, tooltip/hidden live status, spinner, and retained fixture warning.
- Real Chromium: **six journeys passed** in isolated API/web ports 4005/3335,
  PostgreSQL 55433 / `languon_controls_e2e`, Redis 56380. All four mapped dictionary
  journeys plus normalized shared reuse and Hebrew availability. Owner/authenticated
  shared reader have exactly source/translation icon actions; examples remain text.
  Tooltip focus/Escape, accessible status, narrow overflow, real worker bytes,
  edits/reuse, retry/cancel and archive denial passed. Assertions found no unexpected
  page/console/network errors (intentional 503 and cancellation aborts are explicit).
  Playwright-owned processes and both disposable containers were removed.
- Backend TypeScript/build/scoped ESLint, web TypeScript/build/scoped ESLint/style
  contract, formatting/diff checks and guide traceability passed. Generated Next.js
  declarations were restored. Final guide revisions: dictionary
  `sha256:eee1e8b11828995b`; shared speech `sha256:56b7a5103be1a668`. Last guide edits
  clarified existing assertions; final passing runtime assertions are unchanged.

The user's ignored local key is now configured; no credential was printed or
committed. Prepared `kie-turbo-bella-v1` and Bella voice `hpp4J3VqNfWAUOO0d1Us` for
all 16 existing curated app languages. The current official voice contract lists
this voice; pronunciation quality per language remains provisional. Turbo pricing
now explicitly lists six Kie credits per 1,000 characters; the survey and local
budget estimate were reconciled to that model-specific source. Spend caps are
100 Kie credits per owner/day and 1000 globally/day, separate from learner tariffs.
Allowlist is exactly `tempfile.aiquickdraw.com,file.aiquickdraw.com`; provider result
host verification through the safe adapter remains part of the live check.
Official pages fetched read-only via curl because web search/open tools failed:
https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5.md and
https://kie.ai/elevenlabs-tts?model=elevenlabs/text-to-speech-turbo-2-5.

Manual live verification: the first probe validated configuration and Kie accepted
one public `alarmer` task. A temporary diagnostic script used the wrong discriminant
(`kind` vs `state`) and exited without retrieving/persisting its task ID. This is
separate from the correctly typed application adapter and deterministic tests.
No application recording/job or user-wallet operation was created. A corrected
additional paid sample was rejected by automatic approval review due to potential
repeat charges; no bypass or second submission occurred. User approval was requested and subsequently granted for exactly one further
tracked `alarmer` sample. That request persisted its task identity before polling;
Kie returned terminal `fail` with code 500 and “Internal Error, Please try again
later.” Read-only lookup of the same task confirmed failure and no result URL.
No further generation call was made. Thus credentials/submission/polling are
verified, while successful audio download and listening quality remain externally
blocked and are not claimed as verified.
Production activation gates and coordinated pause/restart instructions remain active.

Final completion and focused security reviews report no open material code or
critical/high/medium security findings. The provider’s terminal failure is handled
by the existing typed application worker/provider path; fixtures are never used as
a substitute. Local ignored configuration remains prepared; deployment must pause
admission and restart both API/worker before generation. Manual diagnostic task
metadata and scripts were removed after recording only safe result summaries.

## E-9 — Safe provider failures and same-origin API routing (2026-10-14)

For the user's exact reported local request, read-only diagnosis queried only job,
inventory and provider metadata. Recording was deleted by failure cleanup; job
was failed with `speech_generation_failed`, free billing, known task ID. Read-only
status lookup of that existing task returned terminal Kie failCode 500 / internal
error, without audio. No private source text, credential or provider identifier was
printed or saved in evidence. No paid submission, data mutation or retry occurred.
Independent contract analysis confirmed current model/Bella/fr payload matches
Kie's documented contract; absent stability/style fields have valid defaults.
There is no evidence that changing model, voice or payload fixes the external error.

- RED real PostgreSQL regressions reproduced the exact misleading response after
  failure cleanup: `speech_recording_unavailable` and null billing. GREEN latest
  backend **74/74**: 34 store PostgreSQL cases, 12 worker units and 28 adapter units.
  Safe generic/temporary provider failures survive inventory deletion; refunded
  payer sees `released_no_charge`, joiners see `free`; administrative removal of
  successful audio remains unavailable. Known numeric/string failure codes are
  classified, unknown failures stay generic, raw vendor diagnostics never persist,
  and definitive task failure never resubmits. Latest backend typecheck, scoped
  ESLint/format/diff and build passed. Owned PG55432 / dedicated
  `languon_auth_speech_failure_test` container and volume removed.
- Web full suite **64 files / 576 tests passed** after safe failure UI changes.
  Final targeted player/control/routing tests and the Node development-proxy
  configuration test pass; the Node check is now included in the normal workspace
  test script. All seven browser clients share `/api` by default and explicit URL
  overrides remain compatible. Proxy tests cover development loopback target,
  credential/path/query/fragment/remote-target rejection and production bypass.
- Real Chromium on disposable web/API3335/4005, PG55433 and Redis56380: initial
  **7/7** authentication and speech journeys passed with same-origin `/api` request
  and protected-byte assertions. Final **4/4** shared speech journeys passed with
  added controlled provider-error response, localized tooltip/live status and
  icon-only retry; normalized shared reuse, narrow view, paid consent/settlement,
  free replay and unsupported controls also pass. Fixtures only. Owned application
  processes and disposable containers cleaned; normal development data/services
  preserved. No unexpected console/page/network errors in verified journeys.
- Web typecheck, lint, production build and backend build passed; generated Next
  declaration restored, final canonical typecheck passed. Shared guide revision
  `sha256:09ac5b0e00c9fcea` synchronized across mapped tests; documentation/traceability
  checks pass. Authentication guide behavior/scenario inventory stays unchanged.

Ignored `.env.local` and sanitized example now use `NEXT_PUBLIC_API_URL=/api`, with
server-only `WEB_API_PROXY_TARGET=http://localhost:4000`. Development Next proxy
strips `/api`; internal backend routes and production NGINX strategy are unchanged.
HTTP-only cookie Path=/, authorization and origin checks passed. Current app
clients use job polling, not SSE/multipart API routes; document bytes upload
directly to a presigned storage URL and therefore bypass the API proxy. Successful live Kie audio, quality/host exercise and production
Selectel/retention/commercial gates remain external; supplier failure is not waived.

Final review remediation: canonical `dev:apps:docker` now also uses browser `/api`
with server-only exact target `http://backend:4000`. Node validation accepts that
single trusted Compose origin and rejects other host/port variants plus credentials,
paths, query/hash. Read-only effective Compose config confirmed only the two safe
web settings. Production rewrites remain disabled. The authentication guide's old
direct API override was corrected; revision `sha256:1b3b7d7393c4523c` synchronized.
All 21 guide checks, auth/shared E2E traceability, formatting/diff checks passed.
Independent completion/security remediation verdicts: no open material findings.

An additional exploratory Quizlet/CSV journey reached its unchanged 320px/200%
import-dialog overflow assertion and stopped before export (dictionary-platform
journey line1551). No legitimate assertion was weakened. Existing responsive CSS
and that layout assertion are outside this repair; no CSV success is claimed.
Passing authentication/speech journeys verify actual proxied JSON and protected
binary bytes. Current client routes have no SSE/multipart; presigned document PUT
bypasses the API proxy. This exploratory stop is recorded as a nonblocking unrelated
limitation, accepted by independent review. All owned extra PG/Redis containers
were removed; generated Next declarations restored and final typecheck passed.

## Gemini adapter activation (2026-10-14)

One explicitly authorized public `alarmer` sample submitted to Kie
`google/gemini-3-8-flash-lite-tts`, Zephyr, single speaker, French style, temperature 1.
Task identity was persisted privately before polling; no repeated submission.
Provider succeeded. Initial guarded download exposed Node24 `lookup(all:true)`
callback incompatibility. After regression fix, the same task returned validated
PCM16 mono/24kHz WAV, 57,644 bytes, duration 1,200 ms, trusted host file.aiquickdraw.com.
No secrets, task ID or signed URL are recorded. This proves generation and guarded
delivery, not an all-language pronunciation benchmark or Russia connectivity.
Ignored local defaults switched to `kie-gemini-zephyr-v1` with 15 curated languages;
prior Turbo credential/config retained. Ukrainian is unsupported by this Gemini
version. Existing real recordings remain reusable. No production activation.

Official sources: [Kie exact model API](https://docs.kie.ai/market/google/gemini-3-8-flash-lite-tts),
[Google exact speech language table](https://ai.google.dev/gemini-api/docs/speech-generation),
[Kie token pricing](https://kie.ai/gemini-3-8-flash-lite-tts).

Verification for this adapter extension:

- Backend adapter/downloader/storage/worker focused tests: 87 passed; speech
  policy tests: 7 passed. Independent security reviewer reran 71 adapter and
  downloader tests.
- Gemini model tariff catalog, lazy initial revision and immutable publication:
  disposable PostgreSQL integration 1/1 passed. Cache reuse after default model
  switch and queued job polling through the pinned previous configuration/voice:
  PostgreSQL integration 2/2 passed.
- Backend typecheck/build, backend scoped ESLint, admin typecheck/ESLint and the
  real Chromium Gemini tariff publication journey passed. User-flow guide and
  mapped E2E revision checks passed; `git diff --check` is clean.
- The `0.02` Kie-credit-per-character operational estimate does not measure the
  model's token-priced bill. One French sample does not establish quality for
  the other enabled languages. Production regional access, billing calibration
  and Selectel delivery remain unverified.
