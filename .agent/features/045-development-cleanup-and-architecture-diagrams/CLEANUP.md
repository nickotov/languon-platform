# Development cleanup run

Status: Implementation and browser verification complete; independent completion/security review with owner.
Base: 007b9eb. Date: 2026-10-19.
Skill: `.agents/skills/development-cleanup/SKILL.md`, read and applied after creation.

## Scope and invariants

User confirms development/no production deployment and authorizes stale code/data
retirement. Audited text-ai application/infrastructure catalogs, worker environment
and composition, deployment validation/examples, Mastra playground defaults,
contracts/admin/backend test consumers and current model/harness docs. Scoped
literal/caller searches were sufficient; no healthy semantic index was required.
This is a bounded runtime retirement audit, not proof that all repository code is
reachable or free of obsolete branches.

Current supported models: DeepSeek Flash and Kie Gemini 2.5 Pro. Keep curated
endpoints/credentials, immutable job identity and prices, replay/ownership/credit
settlement protections, deterministic local providers and current execution gates.

## Candidate ledger

| Candidate                                          | Evidence                                                                                                                                                     | Disposition                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DeepSeek Chat catalog and adapter identities       | ADR0036 identifies legacy model; Flash already implements current DeepSeek tasks; user explicitly requests obsolete model removal                            | Removed from curated application and wire catalogs, observations, worker/deploy choices, playground defaults. Reject retired snapshot/input; tests/examples use supported models.                                  |
| Arbitrary environment model/base URL/key execution | Worker/deploy retained alternate resolver in addition to fixed curated catalog; old fallback could execute arbitrary route                                   | Removed resolver, URL validation helpers and composition fallback. Require supported catalog and provider key. Old override names remain solely to reject unsafe stale configuration; no executable compatibility. |
| Mutable local Chat readiness data                  | Verified APP_ENV development, localhost:5432/languon, active default Flash; six Chat ephemeral observations                                                  | Deleted precisely six obsolete observations in transaction; postcondition zero.                                                                                                                                    |
| Historical Chat revisions                          | Four immutable old configuration revisions; active default Flash; zero Chat selected jobs/preferences                                                        | Retained as historical/audit records, not executable model support. No need to reset or rewrite historical data.                                                                                                   |
| Unmanaged dictionary default/deterministic route   | Admission still returns null execution when managed global config absent; local deterministic mode and explicit curated environment execution remain current | Retained current path. `legacy` naming alone is not evidence of dead code.                                                                                                                                         |
| Versioned v1 formats                               | Formats still admitted by configurable API/worker declarations, learning default generation format and schema branches                                       | Retained current selectable behavior. Removing every revision would require coordinated format/data retirement beyond this bounded model cleanup.                                                                  |
| Retry/replay, worker capability, price guards      | Active jobs and concurrent releases depend on ownership, immutable execution and ledger invariants                                                           | Retained protections; fixed one integration fixture to satisfy the newer price guard before asserting the selected-worker guard.                                                                                   |

ADR0038 narrowly supersedes Chat/arbitrary-route retention rules in ADR0021,
0026 and0036. Other immutable accounting and current format guarantees remain.
No schema/migration change was needed (identities are strings).

## Local data execution

Used ignored `.env.local` only through Node loadEnvFile without logging values.
Guarded environment, loopback hostname and `/languon` database before inspection
and mutation. Read-only preflight: six total configuration revisions/four Chat;
active Flash default count1; Chat selected jobs0/preferences0/observations6.

Executed in a transaction on the verified local development target:

```sql
select id from dictionary_ai_worker_observations where model_id='deepseek-chat' for update;
-- Abort unless exactly six rows.
delete from dictionary_ai_worker_observations where model_id='deepseek-chat' returning id;
select count(*) from dictionary_ai_worker_observations where model_id='deepseek-chat';
-- Commit only when remaining count is zero.
```

Result: deleted6, remaining0. No jobs, preferences, revisions, ledger, schema or
other models were mutated. Restoration of readiness rows is unnecessary: current
workers regenerate observations for supported models. Reinstating old model
execution would require explicitly reversing the retirement decision and code.

## Verification

- C1: `pnpm --filter @languon/backend exec vitest run tests/unit/modules/text-ai tests/unit/modules/dictionaries/infrastructure/ai tests/unit/infrastructure/playground tests/unit/infrastructure/worker/dictionary-worker-environment.test.ts tests/unit/modules/development-harness tests/unit/mastra tests/unit/modules/administration tests/unit/modules/texts/texts-worker.test.ts` — 23 files/203 tests pass (before final composition simplification; final rerun below).
- C2: Disposable owned `languon-cleanup-045-postgres`, localhost55457, `languon_auth_cleanup045_test`. `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=<owned-loopback-target> AUTH_TEST_DATABASE_CONFIRM=languon_auth_cleanup045_test pnpm --filter @languon/backend exec vitest run tests/integration/modules/text-ai/text-ai-preferences.test.ts tests/integration/modules/text-ai/text-ai-selection-guard.test.ts tests/integration/database/administration-store.test.ts` — 3 files/36 tests pass. Includes new retired Auto/default rejection, retired explicit rejection, immutable records, concurrency and real SQL worker guards. No migration added; current full migrations applied by fixture.
- C3: `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=<owned-loopback-target> AUTH_TEST_DATABASE_CONFIRM=languon_auth_cleanup045_test ALLOW_DISPOSABLE_REDIS_TESTS=true AUTH_TEST_REDIS_URL=redis://127.0.0.1:56457/1 AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56457/1 node scripts/run-user-ai-model-preferences-e2e.mjs` — mapped real API/PostgreSQL/Redis preference journey1 passes; synthetic users and deterministic providers only.
- C4: `node scripts/run-mastra-playground-e2e.mjs` — mapped guarded disposable playground journey1 passes; final rerun after guide correction below.
- C5: `pnpm --filter @languon/admin exec vitest run tests/ai-settings.test.tsx tests/admin-api.test.ts` — 2 files/17 tests pass. `pnpm --filter @languon/contracts exec vitest run tests/text-ai.test.ts` — 2 tests pass.
- C6: `node --test infra/deploy/tests/config.test.mjs` — 12 tests pass. Combined production-security run has one baseline failure: worker already receives DICTIONARY_HMAC_SECRET for current shared speech while assertion says absent; verified both at base007b9eb. Cleanup removes the legacy model-key assertion but does not change HMAC authority.
- C7: backend typecheck and scoped ESLint pass before final composition simplification; final rerun below. Guide checks for Mastra and preferences, plus docs:user-flows:check pass (23 guides at execution). Revisions reflect selected model/default behavior.

An initial `pnpm ... test -- <files>` accidentally forwarded a Vitest separator and
began broad selection; interrupted immediately, no result used as evidence. All
recorded selected checks use `exec vitest run <files>`.

## Remaining verification and coverage

Main owner integrates independent/security review and required real-browser model
catalog evidence. Admin E2E fixture identifiers were updated to current model;
full unrelated admin journey was not repeated solely for fixture spelling.
Only owned disposable Docker containers are to be stopped after verification.

## Final cleanup patch evidence

C8 final: backend unit command C1 plus
`tests/unit/infrastructure/worker/dictionary-worker-command.test.ts` — 24 files,
209 tests pass after composition/default simplification. Backend typecheck and
scoped backend ESLint pass for final source. C4 mapped Mastra journey rerun passes
with final playground retired-model validation and revision4150f855b91f5719.
C2/C3 remain valid: no admission/persistence code changed after successful runs;
subsequent edits only simplified worker environment composition and playground.

Owned executable/test/config patch SHA256: `2a18c85ee8f7eb4903069597ed072abe8a84370c9761aa5b1ee43a30de484795`.
Captured from git diff of apps/backend, packages/contracts/tests, apps/admin/tests,
infra/deploy, .env.example and affected current development/model guides, against
base007b9eb. No paid provider calls. Owned cleanup045 Postgres/Redis containers
stopped and automatically removed. Ordinary development containers untouched.

Final traceability recheck encountered the main owner's temporary viewer marker
`pending`; earlier completed cleanup guide mapping checks passed. Main must rerun
repository mappings after viewer registration is finalized. Diff whitespace check
passes. Required runtime browser observation and independent/security review are
tracked by the feature owner.

## Author preflight remediation and browser completion

C9 — The affected production-security test had an outdated assertion forbidding
DICTIONARY_HMAC_SECRET from the dictionary worker. Verified actual authority:
worker `createSpeechInfrastructure` passes that secret to
`speech/infrastructure/composition.ts`; it creates HmacDictionaryCryptography
for source resolution and supplies the fingerprint fallback. Updated the test
to require the exact mandatory binding and verify the worker consumer. Retained
negative assertions for HTTP/auth/cache authority and added negative assertions
for retired model API key/base URL variables. This updates the expected boundary
rather than removing security coverage. `node --test
infra/deploy/tests/production-security.test.mjs infra/deploy/tests/config.test.mjs`
now passes18 tests; the earlier baseline failure is resolved.

C10 — Read browser-verification skill and reviewed admin Playwright startup,
synthetic authentication/bootstrap, deterministic worker and mapped guide before
execution. Extended existing `admin-configures-dictionary-ai-default` test with
rendered Flash presence/Chat absence, a390x844 narrow viewport observation, and
unexpected failed-request checks. Existing test covers keyboard selection,
DeepSeek-to-Kie save/reload, real queued immutable revisions, deterministic
worker execution, API proposal acceptance, console/page errors and HTTP errors.
It restores1280x720 for the full composed journey. No supplied visual design.

Exact successful command:

```sh
ADMIN_E2E_DATABASE_URL=postgresql://cleanup:cleanup-local@127.0.0.1:55458/languon_admin_e2e_cleanup045_test ADMIN_E2E_REDIS_URL=redis://127.0.0.1:56458/1 ADMIN_E2E_ADMIN_ORIGIN=http://localhost:4311 ADMIN_E2E_BACKEND_ORIGIN=http://localhost:4312 ADMIN_E2E_WEB_ORIGIN=http://localhost:4313 pnpm --filter @languon/admin exec playwright test tests/e2e/admin-user-management.journeys.spec.ts --grep 'owner configures providers and queued jobs retain their selected revisions'
```

Result: Chromium1 passed in23.4s against real backend/admin/web local processes.
No unexpected console/page/HTTP/request failures. Existing bounded Ant Design
circular-reference development warning remains explicitly filtered by the
maintained helper. Initial new network assertion caught React Query cancellation
on navigation; inspection showed only ERR_ABORTED read-only model-prices and
user ai-credit GETs. A narrowly scoped cancellation exception handles these;
all other failed requests remain failures. Passing final run covers changed
labels/catalog availability and applicable narrow state; no second exploratory
browser session is necessary under browser-verification policy.
Owned cleanup045-admin Postgres/Redis containers were isolated by nondefault
ports/database and synthetic-only values; stopped/auto-removed after execution.
`pnpm user-flow:e2e -- check ai-provider-management` passes. Admin scoped E2E
ESLint passes. No guide behavior claims needed changes.

Ignored `.env.local` startup maintenance: secret-safe parsing found exactly one
retired MASTRA_MODEL_ID; replaced exact obsolete selection with current Flash.
No legacy model endpoint/key variables were present. Provider credentials were
preserved and no secret values printed or recorded.

Final C9/C10-inclusive cleanup patch SHA256: `8746db2b520c3a4a1c4d129c6fbdb42b712c20b02d349ee74cd541fc1c31e2f3`. Earlier source/persistence test evidence remains valid: subsequent changes only strengthen deployment/E2E assertions and update ignored local model selection.

## Source compatibility audit completion

Additional scoped caller audit (requested author-preflight follow-up) found two
pure dictionary source aliases. Production DictionaryGenerationService already
calls acceptSingleCard and acceptBatch; only integration fixtures used the
aliases. Removed acceptPastedTerms from the application port and Drizzle adapter,
and removed the deprecated Drizzle accept forwarding method. Migrated all
existing batch and worker tests to canonical methods without deleting their
behavior, replay, provenance, expiry or concurrency assertions. No public HTTP
operation or persisted representation changed. Repository source search finds
no remaining acceptPastedTerms or generationStore.accept caller.

Removed worker environment provider.baseUrl, provider.credentialReference and
provider.providerModelId duplicate fields: no runtime consumer remained after
curated resolver cleanup. Runtime uses catalogModel and its trusted definitions;
unit assertions now verify that authoritative nested model. Keep modelId because
worker errors consume it. Removed redundant optional-model guard/non-null
assertion now that Mastra always requires catalogModel.

C11 — `pnpm --filter @languon/backend exec vitest run
tests/unit/infrastructure/worker/dictionary-worker-environment.test.ts
tests/unit/infrastructure/worker/dictionary-worker-command.test.ts
tests/unit/modules/dictionaries/application/dictionary-generation-service.test.ts`
— 3 files/30 tests pass. Scoped ESLint for changed environment/port/Drizzle
adapter and existing updated integration tests passes. Backend typecheck run
for final canonical-method/worker alias removal passes.

C12 — Owned disposable Postgres `languon-cleanup-045-shims-postgres`, loopback55459,
database `languon_auth_cleanup045_shims_test`. Exact selected command with
ALLOW_DISPOSABLE_DATABASE_TESTS=true and confirmed owned AUTH_TEST_DATABASE_URL:
`pnpm --filter @languon/backend exec vitest run
tests/integration/modules/dictionaries/infrastructure/dictionary-worker-version-overlap.test.ts
tests/integration/modules/dictionaries/infrastructure/dictionary-batch-generation-store.test.ts`
— 2 files/36 tests pass. Full current migrations applied by guarded fixture;
acceptance, immutable provenance, expiry, replay, worker lease/concurrency,
provider accounting and batches retain their existing behavior. No migration
or ordinary local-development data mutation was needed for source alias removal.
The owned test container is stopped/auto-removed after verification.

C10 browser evidence remains valid for rendered model set/navigation: subsequent
source cleanup removes unused environment output aliases and forwarding methods;
the current application path was already canonical and its focused integration
cases passed C12. No browser/client code changed.

C11/C12-inclusive cleanup patch SHA256: `5b891a08c46a9565f686798bc6ceffd40f1eb9ba02eff5e4521a988bbd5b694b`.

## Owner-scoped pronunciation retirement (ADR-0040)

The broader audit found a complete compatibility-only pronunciation subsystem
beside the current shared speech implementation. Removed its backend service,
worker, routes, domain/ports, Drizzle engine/measurement, old API/client contracts,
unconsumed dictionary-audio frontend feature, generation-capability field and
one-time migration CLI/class. Current screens already use speech-playback;
canonical shared provider/storage/ports imports replace dictionary re-export
aliases. Moved the live budget helper to speech. Existing current speech tests,
authorization/reuse/accounting/retention and key/provider/storage rotation remain.
Removed old queue measurement branch while retaining sanitized current dictionary
operational measurement coverage. SPEECH_* flags alone enable playback/admission;
DICTIONARY_AUDIO provider/storage/profile/budget settings remain live adapters.

Removed only tests exclusive to retired protocol, worker and one-time migration.
Preserved current dictionary card text/language/playback-slot regression in
`dictionary-card-list-speech.test.tsx`; frontend scope8 files/48 tests and lint
pass. Updated current operations/guide cutover claims and shared speech markers.
Main owns removed legacy deployment namespace, budget relocation to sharedSpeech,
CLI release options and root command docs. See ADR0040 and
[AUDIO-PERSISTENCE.md](./AUDIO-PERSISTENCE.md) for generated guarded0074,
old3-table retirement, speech-owned live blob schema, user/content purge changes,
58 integration/unit checks and actual scoped SQL role evidence. Local old audio
assets/jobs/bindings/blobs were all0 before any retirement migration. No remote
objects or paid tasks existed in old inventory; no object deletion was performed.

Pure unscoped shared HMAC identity compatibility was also retired: recordingClass
is now required; identity lookup uses current scoped keys with retained rotation
secrets only. Current fixture/live isolation, pending identity, unsupported-language
cached pronunciation and current rotation/replay protections remain tested.

C13 — Final backend selected units: `pnpm --filter @languon/backend exec vitest run
tests/unit/modules/speech
tests/unit/modules/dictionaries/infrastructure/audio-adapters.test.ts
tests/unit/modules/dictionaries/infrastructure/audio-storage.test.ts
tests/unit/modules/dictionaries/infrastructure/audio-download.test.ts
tests/unit/infrastructure/worker/dictionary-worker-command.test.ts
tests/unit/infrastructure/worker/dictionary-worker-runtime.test.ts
tests/unit/modules/dictionaries/application/dictionary-generation-service.test.ts`
— 9files/129tests pass. Final backend typecheck and scoped ESLint on changed
composition, worker runtime, speech policy/store/environment and updated tests pass.
Contracts build passes after obsolete schemas/capability removal.

C14 — Final current shared-speech disposable test on owned55461
`languon_auth_rekey045_test`: guarded database environment +
`pnpm --filter @languon/backend exec vitest run
tests/integration/modules/speech/shared-speech-store.test.ts
tests/integration/modules/speech/speech-guards.test.ts` — the first file exists
and ran33tests, all pass; the second specified filename does not exist and is
not claimed as executed. Real guard coverage resides in the selected shared
suite and the separate role tests in AUDIO-PERSISTENCE.md. Existing old-format-only
cases were removed/migrated to scoped fixtures; actual rotation/isolation,
recovery, accounting and source authorization cases remain.

### Exact local canonical rekey

Secret-safe read-only preflight on verified APP_ENV=development,
localhost5432/languon found11 shared recordings:5 known scoped ready,2 positively
matched unscoped ready,4 unknown deleted/redacted terminal. Unknown terminal
records remain history and are not reused/rekeyed.

Disposable proof first used synthetic recording1+terminal free job1 in owned
55461/languon_auth_rekey045_test, applying full current migrations. Both ordinary
key changes were rejected with23514 before maintenance. A transaction took ACCESS
EXCLUSIVE locks on speech_recordings/jobs/quotes, disabled only
speech_recording_transition_guard and speech_job_transition_guard, updated exact
canonical keys, reenabled both guards before commit and compared every non-key
column. Result: only keys changed; both guards rejected ordinary mutation again
and both pg_trigger states were O. No permanent bypass or tool capability added.
Temporary proof script SHA256dabea0d361c43f91766bb94ff728d0d0da62e0705342e76869214f86a7767f81.

The authorized local maintenance repeated that bounded algorithm only for the
2 positively matched ready records. It required exactly2 matches, refused any
associated in-flight/unknown/reserved/leased job, locked the same three tables,
scoped each HMAC using the same matched secret and actual provider class, updated
jobs by recording_id+old canonical key, and updated quotes only by matching old
key+provider class. All old/new HMAC/key/private text comparison remained in memory.
SQL shape (parameters never printed):

```sql
LOCK TABLE speech_recordings,speech_jobs,speech_quotes IN ACCESS EXCLUSIVE MODE;
ALTER TABLE speech_recordings DISABLE TRIGGER speech_recording_transition_guard;
ALTER TABLE speech_jobs DISABLE TRIGGER speech_job_transition_guard;
UPDATE speech_recordings SET canonical_key=$scoped WHERE id=$exact_id AND canonical_key=$old;
UPDATE speech_jobs SET canonical_key=$scoped WHERE recording_id=$exact_id AND canonical_key=$old;
UPDATE speech_quotes SET canonical_key=$scoped WHERE canonical_key=$old AND (profile->>'provider'='fixture')=$class;
ALTER TABLE speech_recordings ENABLE TRIGGER speech_recording_transition_guard;
ALTER TABLE speech_jobs ENABLE TRIGGER speech_job_transition_guard;
-- Compare every non-canonical-key column, require exact scoped results and both enabled guards before commit.
```

Result: recordings rekeyed2, dependent jobs rekeyed2, quotes0; total recordings11;
all non-key columns/IDs/storage/pricing/credits unchanged, both guards enabled.
Ledger/reservation tables were never updated. No provider/object mutation occurred.
Temporary local maintenance script SHA25676bb7cb177d1322b4b657aecff1b87c4ee1600b7e9abaceb9962e279fec2b856.
Both temporary scripts were deleted immediately; no reusable guard bypass shipped.

### Current speech browser evidence

C15 — Read maintained web Playwright startup and mapped dictionary/shared tests.
Executed `pnpm --filter @languon/web exec playwright test
tests/e2e/dictionary-pronunciation-audio.journeys.spec.ts
tests/e2e/shared-pronunciation.journeys.spec.ts` with owned loopback PG55460
languon_auth_speech_e2e_cleanup045_test, Redis56460/1, web4323/backend4322,
fixture synthesis and explicit empty voice/retained mappings (no paid providers).
Chromium8tests pass in1.5minutes. Proves actual media bytes/playback, source and
translation-only icon/tooltip slots, changed source asset, download retry/delayed
selection cancellation, cross-account reuse, exact paid quote/cancellation/success,
free replay and unsupported-language controls. Maintained console/page/request
checks pass. Narrow/keyboard states covered by existing dictionary tests.
Initial startup attempt collided with another task's shared.next-e2e lock and
ran no tests; rerun after that owned process stopped passed. No result substituted.

Shared guide revision78ad180c5e1dd88f synchronizes4 mapped files. Both shared and
dictionary pronunciation guide mapping checks pass. Remaining mapped
flashcard/sentence/admin speech selections running independently below; existing8
results need no duplicate execution.

C16 — Remaining mapped shared guide executions:
`AUTH_E2E_SENTENCE_SERVICES=true ... pnpm --filter @languon/web exec playwright test
tests/e2e/flashcard-training.journeys.spec.ts
tests/e2e/sentence-practice.journeys.spec.ts --grep
'owner configures a session|anonymous shared practice|checks owner practice'`
uses the same owned PG55460/Redis56460/web4323/backend4322 and explicit fixture
voice/retained settings as C15. Flashcard owner and anonymous selections2 pass.
The sentence test reached its speech/history/preview assertions but failed
existing focus restoration at line764: after shared practice history dialog
closes, persistent More dictionary actions trigger is inactive. Main UI owner
is fixing the actual focus lifecycle; assertion retained. Exact remaining
sentence rerun follows remediation below.

C17 — `ADMIN_E2E_DATABASE_URL=<owned-loopback55462/languon_admin_e2e_speech045_test>
ADMIN_E2E_REDIS_URL=redis://127.0.0.1:56462/1
ADMIN_E2E_ADMIN_ORIGIN=http://localhost:4331
ADMIN_E2E_BACKEND_ORIGIN=http://localhost:4332
ADMIN_E2E_WEB_ORIGIN=http://localhost:4333
DICTIONARY_AUDIO_PROVIDER=fixture DICTIONARY_AUDIO_STORAGE=postgres
SPEECH_PLAYBACK_ENABLED=true SPEECH_GENERATION_ENABLED=true
DICTIONARY_AUDIO_VOICE_MAP='' DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS='[]'
DICTIONARY_AUDIO_RETAINED_S3_CONFIGURATIONS='[]'
DICTIONARY_AUDIO_RETAINED_FINGERPRINT_SECRETS='[]'
pnpm --filter @languon/admin exec playwright test
tests/e2e/admin-user-management.journeys.spec.ts --grep
'owner searches the retained speech|owner publishes an immutable speech|owner previews private speech bytes'`
— Chromium3tests pass in37.4s: private bytes/changed-impact erasure, retained
inventory search without object URLs, immutable speech tariff publication/stale
edit. No unexpected console/page errors. Earlier startup without explicit
provider/storage inherited local Kie and failed closed before tests; corrected
fixture command above passed. No paid request occurred. Owned adminspeech
Postgres/Redis containers stopped/auto-removed; only sentence-rerun services remain.

Final local HMAC read-only postcheck:11records=7known scoped ready,
0unscoped,4unknown deleted,0unexpected unknown. All actual recording bytes retained.
No ordinary database schema migration has been applied by this worker; main owns
final reviewed local migration execution. Disposable rekey-proof container removed.
Final docs:user-flows check16 validator tests+24guides passes, both audio mapping
checks pass. Current source/reference search finds no retired service/worker/
request/response/CLI consumers in app/contracts/current operations guides.

C18 — Sentence remediation final: main reproduced/fixed Menu focus ordering with
a regression unit. Unchanged native browser focus assertion764 then passed. The
journey later exposed stale bearer capture in its fixture: request listener only
watched direct apiOrigin, while actual current browser requests use same-origin
/api proxy. Trace comparison in memory found22 successful authenticated proxy
requests, changing bearers, and direct failed bearer differed from latest proxy;
the token had not expired. Fixed only that test listener to recognize explicit
backend origin or the current page's same-origin /api path. No application auth
rule/behavior or expected failure assertion changed. Scoped test ESLint passes.

Reran only `tests/e2e/sentence-practice.journeys.spec.ts --grep 'checks owner practice'`
with C16 owned fixture environment. Chromium1 passes in29.7s (test20.1s): owner
practice, paid-check denial for zero-credit reader, free saved references,
sentence library/private media, shared history, native focus restoration,
source rotation/revocation and original real HTTP/error assertions. C15 unchanged
8cases +C16 flashcard2 +C17 admin3 remain valid; the final changed fixture1case
passes. All10 mapped shared speech scenarios and dictionary4 scenarios have
current deterministic real-browser execution evidence. No full unrelated admin
suite is claimed. Guide last_verified dates updated after actual execution;
removed dead dictionary guide source_paths point only to current speech code.

Final cleanup-owned source/test/docs patch fingerprint is recorded below.
Required independent/security review and reviewed ordinary local schema migration
execution remain with main; no cleanup-owned blocker remains.

C18-inclusive scoped Git patch SHA256 `450562ad6281444a918c42a0541aa3d038054d4daaf0ee0f1c56159e5fff34f8` at base007b9eb. The diff paths intentionally include collaborating deployment/health edits; each owned component keeps separate detailed evidence.
