# Additional compatibility audit

Date: 2026-10-19. Owner: skills worker. Mode: read-only source/caller audit using
`.agents/skills/development-cleanup/SKILL.md` and efficient code search.
This extends AC-2 discovery; it is not implementation or runtime verification.
The user confirms this application is in development and has no production
deployment. No database, cache, object store or paid provider was accessed here.

## Conclusions and implementation boundaries

| Candidate                                                   | Evidence and classification                                                                                                                                                                                                                                                                                                                                 | Concrete retirement boundary                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend `/health`                                           | `modules/health/interface/http/health.route.ts:15` explicitly declares compatibility liveness; `/livez` already returns the same liveness with release identity. README, web/admin Playwright startup and backend health tests still call it.                                                                                                               | Replace those callers with `/livez`; remove only the old route and `packages/contracts/src/health.ts`/root exports when their callers are gone. Keep `/readyz` dependency/draining behavior. The architecture viewer's own `/health` is a separate live endpoint, not this alias.                                                                                                                                                                                          |
| Old dictionary pronunciation web feature                    | `features/dictionary-audio/index.ts` exports a hook/control; scoped `rg` across all `apps/web/src` finds no import outside that folder. Its prepare helper is the only production-source caller of `dictionaryAudioApi`; tests also consume that API. Actual editor/shared dictionary/library pages import `SpeechControl` from `features/speech-playback`. | Remove the unreachable feature, its entity API/export/types used only there and old tests. Keep the active speech-playback client/control and their authorization, polling, confirmation and fixture UI. This deletion does not require inventing a replacement screen.                                                                                                                                                                                                    |
| Old dictionary pronunciation backend                        | API `src/index.ts:165`, dictionary composition and worker command still construct the owner-scoped service/store/routes and old worker beside shared speech. Old generation stays executable when legacy generation is on and shared generation is off.                                                                                                     | It is a mounted old protocol/cutover system, not simply unused code. Retire the engine as a coherent unit after verifying current clients use shared speech: routes/service/worker/store/domain/contracts, construction, capability/measurement reporting, old environment/release declarations and purge participants. See detailed boundary below.                                                                                                                       |
| `LegacySpeechMigration` and CLI                             | The class only copies old ready bytes and transfers uncertain tasks; CLI is its sole runtime caller through root `speech:migrate` and backend built script. Shared service/worker never calls this class.                                                                                                                                                   | Solely additive-cutover compatibility. Under authorized disposable-data retirement, remove the class/CLI/commands and migration-only tests after accounting for old inventory/task states; there is no requirement to preserve this executable migration forever. Supersede ADR-0031's active additive-cutover clause.                                                                                                                                                     |
| Unscoped speech canonical HMAC aliases                      | `drizzle-speech-store.ts:160` computes legacy keys without recording class; current writes use `fixture`/`pronunciation` scoped identities. `speechTextIdentity`'s optional fourth argument exists for the old shape and migration class.                                                                                                                   | Pure persisted-key format compatibility. Require the recording class, remove unscoped aliases and migration use, update old-format-only tests and clean/rekey only affected disposable recordings/jobs/bindings with source/storage inventory accounted for. Preserve fixture/live isolation and current HMAC key rotation semantics.                                                                                                                                      |
| Retained speech fingerprint/provider/storage configurations | Current store reads retained HMAC keys; workers poll persisted task IDs with their original provider configuration. Routing storage resolves original inventory references and all-version erasure. Tests cover rotations, source access and deletion impact.                                                                                               | These mechanisms protect current provider/key/storage changes, not only old dictionary migration. Preserve unless the chosen product configuration explicitly abandons rotation/recovery. A zero-use local configuration can be removed from environment data without deleting the general current safety mechanism.                                                                                                                                                       |
| Speech HMAC fallbacks in composition                        | `createSpeechInfrastructure` receives a parsed environment whose `fingerprintSecret` is always a string, yet uses `fingerprintSecret ?? dictionaryHmacSecret`. Worker has a separate dictionary-source HMAC fallback.                                                                                                                                       | The first fallback is unreachable after environment validation and can be removed mechanically. Do not conflate it with the worker's source-share HMAC default: live source authorization must use the same dictionary secret as the API; verify development default/config consistency before changing it.                                                                                                                                                                |
| Missing copied attachment `kind`                            | Contract `contextual-assistant.ts:515` labels missing kind legacy; current `context-picker.tsx:82` actively creates pasted attachments without kind. Attachments are persisted as JSON and replayed.                                                                                                                                                        | Make current paste construction explicit `kind: 'text'`, require that discriminant in the contract, update constructors/fixtures and backfill or narrowly discard disposable JSON attachments before removing old acceptance. Preserve inert text semantics and structured-card content equality; do not remove pasted-text capability.                                                                                                                                    |
| Sentence generation v1                                      | `config/environment.ts:110` and `.env.example:214` default to v1. `drizzle-sentence-practice-store.ts:416` actively chooses policy 1 from configured format; workers, contracts/schema and UI support both.                                                                                                                                                 | This is current selectable generation behavior, not unreachable compatibility. A deliberate v2-only retirement can remove it, but must first activate v2 as the sole supported contract and update curated configuration capability revisions, API/worker allowlists, prompts/domain validation/schema checks/tests and disposable saved exercises/jobs/preparation batches. Keep free reference review and independent `sentence-check:v1` (different current operation). |
| Other `legacy` identifiers                                  | `legacyBudget` supplies unmanaged deterministic/current text-AI admission; Mastra `defaultGenerateOptionsLegacy` is an SDK option; PDF.js `/legacy/build/` is a package entry point; conversation control fallback rejects malformed input.                                                                                                                 | Their names alone do not justify deletion. Keep live budget/failure protections and package APIs; a rename can clarify local terms but is not evidence of obsolete behavior. Main cleanup worker owns dictionary aliases/v1 authoring review.                                                                                                                                                                                                                              |

## Old speech subsystem removal scope

The current editor's speech control is already the replacement. These paths prove
that deleting the old engine requires more than removing `legacy-migration.ts`:

- `apps/backend/src/index.ts:150–180`: adapters feed shared speech and old dictionary
  audio service. Old generation is gated by `!SPEECH_GENERATION_ENABLED`.
- `modules/dictionaries/infrastructure/dictionary-composition.ts:105` creates
  `DictionaryAudioService`; line 181 mounts the old request/status/content routes.
- `infrastructure/worker/dictionary-worker-command.ts:235` constructs the old audio
  worker; line 410 schedules it alongside shared speech. Measurement/capability
  observation also includes old audio.
- `modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store.ts`
  checks old leases/writers, inventories old object references and finalizes old
  jobs/bindings/assets/blobs. `drizzle-owner-deletion-preparation.ts` fences old jobs.
  Preserve account deletion's current shared-speech detach/settlement behavior.
- `modules/dictionaries/infrastructure/persistence/drizzle/audio-schema.ts` owns
  `dictionary_audio_assets/jobs/bindings/blobs`; global `infrastructure/database/schema.ts`
  registers them. Old byte storage is also used by the shared speech test/compatibility
  adapter, so dropping `dictionary_audio_blobs` is a separate storage decision.
- Actual editor/shared dictionary/library screens use `features/speech-playback`;
  the orphan old feature uses `dictionaryAudioApi` and old URL paths.

Recommended sequence within the already authorized feature scope:

1. Confirm remaining consumers by scoped source/export/config/deployment/test search;
   remove old frontend entry points and old HTTP admission together. Keep current
   speech sources, card/settings version checks and bearer-to-digest conversion.
2. Inspect exact disposable target inventory before deletion: old states/counts,
   active/unknown provider task identities, old object namespaces/versions and shared
   references. No such counts were collected by this audit. Development status alone
   does not establish permission to erase an arbitrary connected database or bucket.
3. Since the application has no production deployment, favor retiring the empty or
   explicitly disposable old inventory rather than maintaining a permanent cutover
   service. Stop submission first; account for any real outstanding provider task,
   cost and storage inventory before deleting rows. Remove migration machinery once
   no consumer/data requires it. Preserve current shared uncertainty handling.
4. Remove old service/worker/store/route/domain/contracts and affected current docs,
   release flags and CLI commands. Adapt owner deletion/schema/grants/guard functions
   in a generated forward migration. Keep old migration history as schema history
   unless a separately reviewed development baseline rebuild is chosen.
5. Keep MinIO/S3 as standard development storage under ADR-0031. Decide separately
   whether PostgreSQL byte storage remains a focused test adapter; if retained, move
   its test storage table ownership out of the removed dictionary subsystem. Retained
   object routing and provider task profiles remain meaningful to current speech.
6. Supersede relevant active migration/rollback wording in ADR-0031, preserving the
   accepted source-access, retention, cost and erasure decisions. ADR-0020 is already
   partially superseded and should not be rewritten as current behavior. ADR-0032
   settlement and ADR-0034 provider registration remain applicable.

## Verification needed for those changes

- Focused backend/web/contracts typecheck and tests; deterministic request rejection
  for removed endpoints/inputs and current shared pronunciation regression coverage.
- Disposable PostgreSQL migration/invariant evidence for dropping old tables or
  changing JSON/key formats, including owner deletion and shared settlement behavior.
- Real MinIO/object inventory checks if storage cleanup changes; no paid synthesis.
- Current dictionary/flashcard/sentence speech browser journeys and guide mappings
  in `dictionary-pronunciation-audio.md` and `shared-pronunciation-playback.md`.
- Existing `legacy-speech-migration.test.ts` becomes obsolete only when the migration
  service is retired. Keep current rotation, fixture/live separation, uncertain
  submission, ownership/source authorization and audited erasure tests.
- `/health` retirement requires web/admin startup configurations, backend health
  OpenAPI tests and README link updates. No database work is necessary for that alias.
- Attachment normalization requires contextual-assistant contract, persisted JSON
  integration and paste browser evidence. Sentence v2-only change requires exercise
  policy/format schema and saved/reference/preparation coverage, beyond a comment edit.

## Coverage and remaining work

Scoped source/reference searches and selected function bodies establish the above
call chains; no semantic project index was used. This report does not prove all
repository code reachable or all local data empty. Main cleanup implementation is
tracked in `CLEANUP.md`; the candidates above are additional discovered work and
must have explicit implementation or retained/deferred disposition before a broad
“all stale compatibility removed” claim. Historical ADR/survey/review records are
evidence and are not candidates for deletion.

## Final implementation dispositions

The initial findings above are preserved as discovery, not outstanding work.
Backend health alias, unused dictionary/worker/UI shims, old dictionary-audio
engine/client/cutover CLI and unscoped speech HMAC readers were retired; see
CLEANUP.md, AUDIO-PERSISTENCE.md and HEALTH-CLEANUP.md for exact final proof.
Current persisted byte storage belongs to shared speech; key/provider/storage
rotation and uncertain-task/accounting protections remain current safety behavior.
Current pasted text without an explicit kind and v1 exercise/authoring formats
are still actively produced/selected product contracts, rather than unreachable
compatibility with a deployed release, and remain supported in this bounded run.
Mastra SDK Legacy option names and PDF.js legacy build are actual package APIs.

The deployer also no longer normalizes retired release manifest schema v1; the
canonical creator already emits v2. Positive fixtures now declare explicit empty
v2 capability envelopes, while tests prove schema-v1 rejection. Generic current
blue/green budget, reader, role and drain protections remain meaningful for future
deployments. No historical ADR/evidence/schema transition history was erased.
