# Evidence: Interactive knowledge workbooks

Status: Integrated implementation under preflight; security remediation and final verification incomplete

## Tested state

Branch: `feature/interactive-workbooks`. Foundation commit: `bb9b40b`.
Runtime integration changes after that commit remain uncommitted. Entries retain
their tested state and historical failures; later entries supersede earlier
claims only for their stated surfaces. Early browser passes do not prove newer
practice, translation, administration or permission changes.

Learning-block source SHA-256:
`b31582d95187d40443dbe514f3afca23d5860b7eb23e5601821d7b97c7df7640`.
Learning-block test SHA-256:
`7343a16c943be12db7dbf8d8a1d555f2ab2be087b413c6f333d88cd5b95acaf7`.

## Acceptance mapping

| Acceptance                      | Implementation                                                                              | Proof                                           | Status                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| AC-1, AC-2, AC-11, AC-12, AC-20 | Reusable contracts/renderers and manual editor                                              | E1–E8, E20, E27                                 | Focused evidence; updated browser gate pending                       |
| AC-3, AC-6, AC-21               | Typed owner proposals, saved read-only shared tutor and source guards                       | E3, E8, later proposal/source-context entries   | Focused evidence; independent review pending                         |
| AC-4, AC-5, AC-7, AC-18         | Workbook/access/copy/media transactions and private-source cleanup                          | E9, E11, E14, E15, E20, E25, E31                | Focused database evidence; final access review/browser pending       |
| AC-8, AC-9, AC-10               | Independent library publication, direct flashcard/sentence practice and private translation | E24, E27, E29, E32, private-translation entries | New production adapters tested; final browser and role proof pending |
| AC-13, AC-14, AC-19             | Private narration, audio grants, duration-metered transcription and grounded questions      | E14, E26, E28, E30                              | Focused evidence; processing review and SEC-4 role rerun pending     |
| AC-15, AC-16, AC-17             | Private attempts/events/completion and monotonic publication epochs                         | E10, E13, E17, E21, E25, E29, E32               | Focused database evidence; updated browser gate pending              |
| AC-22                           | Compatibility, documentation, independent review and required final gates                   | E27 and final entries pending                   | Not complete                                                         |

Runtime block/document integration is implemented. No milestone is marked complete
before its required final evidence is valid. Component/contract checks do not
replace real-browser/database proof; contract validation alone is not browser XSS
proof. Final source/security/evidence approval remains pending.

## Checks

- E1 — `packages/contracts/src/learning-blocks.test.ts`: 15 tests passed, as
  reported by the contracts implementer. Command:
  `pnpm --filter @languon/contracts exec vitest run src/learning-blocks.test.ts`.
- E2 — Contracts typecheck and scoped lint passed, as reported by implementer.
  Exact invocations pending consolidation; do not infer whole-repository checks.
- E3 — Legacy writer-freeze selection: 25 tests passed, as reported by the
  coordinator/security implementer. Command:
  `pnpm --filter @languon/backend test src/modules/conversations/infrastructure/ai/contextual-tutor-tools.test.ts src/modules/conversations/infrastructure/ai/contextual-tutor-runner.test.ts`.
  Focused lint also passed:
  `pnpm exec eslint packages/contracts/src/contextual-assistant.ts apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.test.ts apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-worker-output.ts`.
  The initial backend typecheck found six test typing errors: the test used
  Zod `safeParse` on Mastra’s Standard Schema interface. After changing the test
  to awaited `~standard.validate`, the focused tool test rerun passed 3 tests:
  `pnpm --filter @languon/backend test src/modules/conversations/infrastructure/ai/contextual-tutor-tools.test.ts`.
  The other 22 runner tests were unchanged. Final
  `pnpm --filter @languon/backend typecheck` passed (exit 0), with focused test
  lint and diff check also passing. This proves the foundation state, not later
  concurrent backend integration changes.
- E4 — Contracts build with the public learning-blocks export completed with
  exit code 0, as reported by coordinator:
  `pnpm --filter @languon/contracts build`. Runtime integration is not implied.
- E5 — `git diff --check`: passed after specification/backlog synchronization.
  This is documentation hygiene, not runtime acceptance evidence.

- E6 — Reusable block component tests: main ran
  `pnpm --filter @languon/web exec vitest run tests/learning-blocks.test.tsx`
  at 22:08:46 on 2026-10-28; 10 passed. This is component-test evidence, not
  rendered real-browser or end-to-end evidence. Views implementer also confirmed
  the final selection passed 10 tests at 22:09:21 with the same command and
  `pnpm exec eslint apps/web/src/fsd/entities/learning-blocks apps/web/tests/learning-blocks.test.tsx`
  passed. Final test SHA-256:
  `0c6170e8ee07b89e0329e514cce3860d09b65fe3d1df033c199b55b6146c449b`;
  root view SHA-256:
  `adf634c9902b4f9fc789697d60b6261e984e27378d907df5b90b3bc6f0adee80`.
  Full web typecheck was not passing at that point due to known concurrent editor
  changes. Views alone do not implement persistence, AI or library actions.
- E7 — Knowledge version-2 domain projection/media-only tests:
  `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/domain/knowledge.test.ts`
  passed 3 tests, reported by persistence implementer. `pnpm db:generate`
  generated migration 0117 and `pnpm db:check` passed. Real integration tests
  are in progress against a task-owned disposable database; no result claimed.

- E8 — Version-2 persistence integration: 55 tests / 2 files passed against
  task-owned disposable PostgreSQL with clean migrations through 0118:
  `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_workbook_v2_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_workbook_v2_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-store.test.ts tests/integration/modules/conversations/conversation-store.test.ts`.
  A strengthened guard-message assertion then passed the selected regression
  with the same environment and `pnpm --filter @languon/backend exec vitest run tests/integration/modules/conversations/conversation-store.test.ts -t "rejects prose proposals and old draft publication against interactive targets"`
  (1 passed, 40 deselected). Final conversation test SHA-256:
  `4fd862fb9de7a0e700d065fe002bf0804a3bf74e4e5b92e6cba0c93071d7f8fd`.
  Backend typecheck passed for this integrated slice. Container ownership was
  handed to workbook tests, then the task-owned container was removed.
- E9 — Workbook persistence: 6 integration tests passed with E8's disposable
  environment and `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/workbook-store.test.ts`.
  Initial sandbox connection EPERM was environmental; authorized retry passed.
  Route/copy selection passed 6 tests:
  `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/interface/http/workbook.routes.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/workbook-copy.test.ts`.
  Audio ownership was subsequently integrated transactionally with copy; E14
  supplies media-lifecycle proof. Owner copy now also has a real API/UI path.
- E10 — Pure learner contracts/domain: 8 passed with
  `pnpm --filter @languon/contracts exec vitest run src/workbook-learning.test.ts`;
  9 passed with `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/domain/workbook-learning.test.ts`.
  Contracts typecheck/build passed. Scoped lint passed:
  `pnpm exec eslint packages/contracts/src/workbook-learning.ts packages/contracts/src/workbook-learning.test.ts apps/backend/src/modules/knowledge/domain/workbook-learning.ts apps/backend/src/modules/knowledge/domain/workbook-learning.test.ts`.
  Schema SHA-256 `4eb586e0ab2d3eebd450c102056048838bfb14d2a39aba0dd6f985e3dd447e1d`;
  domain SHA-256 `ee6b3751c433c39268a8d74c36bd87863198b26a9111e3dbdc9ef5f76a4741d7`.
  This initial check is pure-domain evidence; E13 adds learner persistence proof.
- E11 — Workbook web API boundary tests passed 6:
  `pnpm --filter @languon/web exec vitest run tests/workbook-api.test.ts`.
  Shared-add acknowledgement component tests passed 2:
  `pnpm --filter @languon/web exec vitest run tests/workbook-membership.test.tsx`.
  `pnpm --filter @languon/web typecheck` passed after adding the new pages/tests.
  Scoped lint passed for workbooks features/pages/routes, both tests and the
  Knowledge library header link. These tests establish API validation and consent
  controls; real-app browser flow remains pending.

- E12 — Editor integration reported by its implementer:
  `pnpm --filter @languon/web exec vitest run tests/knowledge-learning-block-editor.test.tsx`
  passed 6. The earlier combined selection with
  `tests/knowledge-editor-initialization.test.tsx tests/knowledge-selection-bubble.test.ts`
  passed 18. `pnpm --filter @languon/web exec vitest run tests/knowledge-markdown-insertion.test.tsx`
  passed 7. Initial timeout was concurrency contention; unmodified baseline and
  new behavior were compared, no timeout/test weakening. Scoped editor lint and
  typecheck passed for that state. Test SHA-256
  `a2b7977febd85589611b14e9707dd5726c97b78738c260c9fc9745ab3fa4e788`.
- E13 — Learner routes: `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/interface/http/learner-routes.test.ts`
  passed 5. With E8's disposable environment,
  `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/learner-store.test.ts`
  passed 7 after migration 0119; covers privacy, concurrent idempotency, source
  revisions, completion and deletion cascade. Store SHA-256
  `bc40e73510e73ace7ac167cde8d6d669f42d9544be02e15f01777714baae48e6`.
- E14 — Media lifecycle: with E8's disposable environment,
  `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/media-store.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-store.test.ts`
  passed 16. Covers saved-only playback, foreign IDs, live revocation, fresh asset
  identities on copy, copy survival after source deletion and physical cleanup
  after final grant deletion. `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/interface/http/media.routes.test.ts src/modules/knowledge/infrastructure/media-audio-validation.test.ts`
  passed 5; migration 0120 generated and db:check passed. No speech synthesis or
  transcription claim follows from uploaded-media evidence.
- E15 — Shared conversation integration: with E8's disposable environment,
  `pnpm --filter @languon/backend exec vitest run tests/integration/modules/conversations/conversation-store.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/workbook-store.test.ts`
  passed 49 (43 conversation + 6 workbook) through migration 0120.
  `pnpm --filter @languon/backend exec vitest run src/modules/conversations/infrastructure/ai/contextual-tutor-tools.test.ts src/modules/conversations/infrastructure/ai/contextual-tutor-runner.test.ts`
  passed 27, covering real pinned SDK/tool composition. Later type narrowing
  still requires final integrated typecheck.
- E16 — View/reader guard tests:
  `pnpm --filter @languon/web exec vitest run tests/shared-knowledge-assistant-actions.test.tsx tests/learning-blocks.test.tsx tests/conversation-error-notice.test.tsx`
  passed 24. Final block-only rerun passed 13 after bounded same-origin blob URL
  support. Block test SHA-256
  `2c9ef8ced022fbe0c9948f6dadbfcdb0bc8de2576de31bea919ff58d07837a2a`.
  Shared controls omit proposal/editor actions and owner controls remain covered.
- E17 — Final workbook/learner web selection at 22:29:20:
  `pnpm --filter @languon/web exec vitest run tests/workbook-api.test.ts tests/workbook-membership.test.tsx tests/workbook-learning.test.tsx tests/workbook-learning-api.test.ts tests/workbook-audio.test.tsx`
  passed 17 across 5 files. Covers owner/shared copy requests, source-grant headers,
  explicit shared-add consent, saved-version guards, server-owned evaluation,
  exact idempotent retry, anonymous non-persistence, separate reveal events and
  authorized audio ObjectURL cleanup. Scoped lint passed. Latest full web
  typecheck failed on two concurrent other-owned UI files (folder `title` vs `name`,
  LoadingState `label` vs children); fixes were reported, final rerun pending.

## Required evidence

Remaining contract/security regressions; real DB migration/transaction/lifecycle
checks; production-composition AI budgets/cancellation/settlement; reusable block
browser journeys and mobile/RTL/accessibility states; affected static/build
checks; guide revision/mapped E2E validation; full critical gate; independent
review and final security/evidence approval. Record exact commands, tested state,
environment, result and limitations when executed.

## Limitations

Transcription provider readiness remains unverified. Media lifecycle has scoped
DB proof (E14), with browser playback and final review still pending. No claim
of end-to-end XSS prevention, privacy enforcement or independent-copy survival is
made yet. Legacy proposal targeting is now covered by E8, but full critical and independent
security review are still required. The first actual browser execution is recorded in E20 and exposed defects; it
is not passing acceptance evidence for the new routes or editor integration.

## E18 — library copies, finalized narrow evidence

Agent v2_contracts reports real disposable PostgreSQL tests through migration 121:
`pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/library-copy.database.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/library-copy.test.ts src/modules/knowledge/interface/http/library-copy-routes.test.ts`
with the established synthetic loopback 55559 disposable database environment:
17 passed (7 DB, 5 pure, 5 HTTP). This supersedes the earlier six-case DB run after
source-only draft support changed. Contracts `pnpm --filter @languon/contracts exec vitest run src/knowledge-library-copy.test.ts`: 4 passed. Scoped lint and diff check passed.
Final DB test SHA-256: `380d0fb0342dec142aa142f5f220833055bb7c955aff74a119b1968a74ee9cc5`.
Browser library interaction remains pending.

## E19 — explicit AI feedback prefill

Agent block_views reports `pnpm --filter @languon/web exec vitest run tests/generic-assistant-request.test.tsx tests/workspace-assistant-context.test.tsx tests/shared-knowledge-assistant-actions.test.tsx`: 14 passed; focused lint passed. This proves explicit Send, no automatic paid call and shared editing controls absent at the source-test level. Host hook rerun after feedback wiring: `pnpm --filter @languon/web exec vitest run tests/workbook-learning.test.tsx`: 5 passed at 22:40:27. AI feedback is conversational; it does not fabricate persisted correctness.

## E20 — early integrated browser risk check, in progress

The new two-journey `interactive-workbooks` stage uses the existing critical
runner and real contextual-assistant fixture with production workbook, learner,
media and library compositions. `pnpm test:e2e:critical -- --flow interactive-workbooks`
started after reserving the exclusive shared-build/runtime slot. Evidence directory:
`test-results/critical-flows/87db3145-8201-4b74-9789-331b0aafc0bd`.
No result yet; this is an early integration risk check, not the final gate.
New guide mapping validation passed before execution. Source lint of the new
journey, fixture and registry passed. Independent harness review remains required.

### E20 first runtime outcome and remediation

Initial sandbox run stopped before app startup on local-port EPERM; approved
escalation used the same owned disposable runner. Run
`40b54f92-9274-44fc-b833-4310c2e0fcd0` executed both browser tests and failed both.
Authoring and upload rendered, but the legacy prose-only canSave gate disabled
publication for block-only content. Main fixed the gate and added a focused
regression. The shared workbook journey reached real ordering, anonymous reading,
reader signup and inert hostile text; submitting an answer produced no HTTP POST
and the field reset. Renderer remount behavior is under investigation. These
failures remain recorded; no browser acceptance claim yet. Runner removes only
its own containers. Guide validation passed (33 guides, 16 validator tests), and
new feedback-prefill hook regression passed (6 hook tests, 22:42:52).

Critical registry safety tests: `node --test scripts/critical-flows/registry.test.mjs`
passed 15/15 after approved local-port permission. Initial sandbox attempt had
14 passes and EPERM on the deliberate port-collision case; no assertion weakened.
Scoped workbook/learner web lint passed after owner workbook chat was explicitly
marked as a saved read-only source. The mobile failure screenshot was inspected:
grammar rule is literal inert text, controls fit 390px width, but the answer field
is empty after the attempted save; this confirms the observed defect rather than
successful practice evidence.

E20 renderer remediation: block_editor reports
`pnpm --filter @languon/web exec vitest run tests/knowledge-block-rerender.test.tsx tests/knowledge-learning-block-editor.test.tsx`
9 passed after retaining module-stable React mapping component identities and
resetting the pinned static-renderer positional key counter each render. The new
regression preserves the learner’s answer across parent/query callback changes
and calls the updated handler. Browser rerun queued after shared contracts stabilize.

### E20 second runtime outcome

Run `45998c37-2580-4b9d-bc7a-5c7c13e58d8a` reached successful block-only
publication and reload. Its author test then selected a hidden option sharing
the grammar title; the assertion now targets the visible heading explicitly.
The full shared-workbook journey passed in 11.4 seconds, including order, shared
addition consent, anonymous access, private learner save, owner isolation,
independent copy after revocation and inert hostile text. This one passing
journey does not satisfy the stage’s required two-test minimum. The same
registered stage is rerunning with no weakened assertions.

E20 third run `02fe2cb1-43ab-4c8b-a602-7891d1313ddd`: shared journey passed
again (12.0s). The author path published, reopened and saved its private attempt,
then Playwright correctly rejected an ambiguous Show answer selector (exercise
and vocabulary both provide it). The test now scopes reveal to the Verb practice
region. Assertions remain strict; this is a harness selector correction, not a
product workaround. A fourth stage execution is in progress.

### E20 passing early runtime checkpoint

`pnpm test:e2e:critical -- --flow interactive-workbooks` passed 2/2, no skips,
25.0 seconds in run `c09c8a16-92c9-4bf8-9549-51a322d0a1dd`, after the recorded
product fixes and harness selector corrections. Shared packages built and the
runner cleaned its owned PostgreSQL/Redis/apps, exit 0. Real manual authoring,
WAV upload, explicit Save/reload, saved standalone private answer/reveal/completion,
1-second playable authorized blob, workbook ordering/shared-add consent,
anonymous reading, reader privacy, independent copy after revoke and inert hostile
HTML all passed. Both journeys assert no page/console errors or HTTP 5xx.
Desktop and 390px mobile screenshots in this run were inspected: controls readable,
grammar distinct, audio fits and completion/unevaluated answer status truthful.

Test SHA-256: `a96ca02186a1cdec70d6fc4dfc47c8e3455fd5b728929f6febb3b11e63e084cb`.
Fixture SHA-256: `febe0bebc852dc0f0976c4c8781e952c762c8462ccbcc1bf550ad2cd47548df8`.
Renderer SHA-256: `7722b0c1b12ffd706f7c9d02257aa53795b8ddd8d4c4b29459800e27d11064dd`.
Save projection SHA-256: `0eb9513efbc456a93a088366cd7c30ed69830fcd42f5322936bff1dd21928ec3`.

This is an early bounded integration checkpoint. It does not prove new paid AI,
transcription, library interactions, aggregate workbook progress, full critical
regressions or independent review. Those remain required.

## E21 — learner-private workbook progress, narrow checks

Added authenticated aggregate counts of current saved members, completed notes
and notes updated since explicit completion. Authority is resolved in a database
transaction under workbook/share locks; completion rows filter the authenticated
actor. Owner and reader use the same private boundary, without learner dashboards.
The saved owner/shared workbook UI refreshes the aggregate after learning writes.

- `pnpm --filter @languon/web exec vitest run tests/workbook-progress.test.tsx tests/workbook-learning-api.test.ts tests/workbook-learning.test.tsx`: 10 passed, 22:57:11. Includes anonymous no-request, stale progress hidden after revoked access, separate updated counts and header-only capability transport.
- `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/interface/http/learner-routes.test.ts`: 6 passed, 22:57:12. Aggregate requires authenticated actor and private no-store response.
- `pnpm --filter @languon/contracts exec vitest run src/workbook-learning.test.ts`: 9 passed, 22:58:47. Aggregate bounds and absent client actor/score inputs checked.
- Scoped aggregate/backend/frontend lint passed after correcting persistence spacing and a misplaced client directive; diff check passed.
- Extended learner DB suite and updated browser aggregate assertions are authored but not yet executed. Existing E20 pass predates the aggregate UI and must not be cited as aggregate runtime proof.

The E20 test revision marker was subsequently updated for guide verification
metadata (no behavior change), then the shared journey gained private aggregate
count assertions for E21. The earlier exact test hash remains its historical
tested state; new final execution will record a new hash.

E21 real PostgreSQL verification passed: with the established disposable
`ALLOW_DISPOSABLE_DATABASE_TESTS=true`, loopback `127.0.0.1:55559` database
`languon_auth_workbook_v2_test` and matching confirmation, ran
`pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/learner-store.test.ts`:
9 passed in 3.14 seconds at 22:59:49. Clean forward migrations through 123;
no schema change from this aggregate slice. Tests prove author/reader isolation,
explicit completion retained and flagged after updates, exclusion after membership
removal, wrong grant kind denial and live revocation denial. Exclusive task DB
ownership was handed to block_views afterward, without container cleanup.
Schema hash `ed23fd6426fa67ca76f17157548994de5266f6eceaed30655243ed365de6abd2`;
aggregate implementation `5a334a2dd8a071ea4c0ae86a9c3f5fcda84c094eb554701e5e6e7d4da092bb16`;
DB test `a18ead2348714f0ec2b07cbe4597bc133f9b51f7872feeb9b1a4bed32e1fc686`;
UI test `0180d4252117788b18026bda32ee7eaffb31b59587636d65dbf0fe6c7a9b3b54`.
Updated real-browser aggregate journey remains pending.

E21 direct-origin transport: workbook OPTIONS intercepted the new aggregate path
but did not yet allow the learner grant kind/locator headers. Extended that exact
allowlist while preserving approved-origin enforcement. `pnpm --filter
@languon/backend exec vitest run src/modules/knowledge/interface/http/workbook.routes.test.ts`:
6 passed at 23:01:45, including the new approved/rejected origin preflight case.
Focused route/registry lint passed.

## E22 — integrated checks and retained regression registration

Main reports `pnpm --filter @languon/web typecheck` exit 0 (session 57096) after
shared owner practice/narration/block-copy/proposal integration and the explicit
exerciseSource return-type correction. This is integrated static proof at that
point, not final feature completion. Main’s seven focused document/media tests
also passed; exact selection is pending consolidation.

The existing backend critical registry now retains production knowledge-speech
execution (three required named cases), partial block copying (two required named
cases), media ownership (two required named cases), and knowledge persistence
(fourteen existing cases); minimum total increased from 300 to 321. No new broad
gate was launched. Registry safety validation `node --test
scripts/critical-flows/registry.test.mjs` passed 15/15 with approved local-port
permission after this registration. Full critical execution remains pending.

## E23 — transcription administration, scoped implementation evidence

Agent block_views reports backend admin service/HTTP 8 passed:
`pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/transcription-admin.test.ts src/modules/knowledge/interface/http/transcription-admin-routes.test.ts`.
Admin UI `pnpm --filter @languon/admin exec vitest run tests/transcription-settings.test.tsx`:
4 passed after a test selector correction for repeated alerts. Admin typecheck
passed after exact-optional field typing correction; scoped lint/diff check passed.
Real DB six-case suite passed through migration 124 at 23:02:15, but a seventh
immutable-update regression and migration 125 are pending; that earlier six-case
run is not final proof of the changed source. No configuration activation or paid
provider calls occurred. Admin real-browser, canonical billing runtime and
security review remain required.

## E24 — direct vocabulary practice, implementation in progress

The independent Knowledge source adapter now reuses the existing flashcard
projection, attempt/Undo policy, setup/session UI and response contracts. New
private note-bound persistence is migration 0129 (seven tables), with explicit
actor erasure in migration 0130. This does not create hidden dictionaries.
Monotonic saved-publication epochs, including A→B→A behavior, are resolved through
the shared epoch ledger. Sentence exercises have an explicit nullable dictionary
identity and Knowledge source alternative; legacy dictionary exercises retain
their original representation. Paid sentence execution and free lifecycle
integration are separately assigned and not yet established by these tests.

Verified focused commands on 2026-10-28:

- `pnpm --filter @languon/contracts exec vitest run src/knowledge-vocabulary-practice.test.ts`: 3 passed, 23:28:28 (source XOR, legacy compatibility, public payload rejects capabilities).
- `pnpm --filter @languon/web exec vitest run tests/knowledge-vocabulary-api.test.ts`: 3 passed, 23:30:05 (header-only proof, canonical access-loss errors, exact operation retry).
- `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/interface/http/vocabulary-practice-routes.test.ts`: 4 passed, 23:31:38 (authenticated actor, bounded share proof, caller identity rejection, source revocation and scoped PUT CORS).
- `pnpm db:generate`: generated 0129_sudden_sauron successfully; inspected delta contains only seven new practice tables and constraints/indexes. Migration execution subsequently passed in the five-case database run below.

Five real-database flashcard cases passed at 23:35:28 through migration0130,
2.73s: `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_workbook_v2_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_workbook_v2_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/vocabulary-practice-store.test.ts`.
Sandbox connection was initially denied (EPERM); the authorized loopback retry
ran the real database. The first real run exposed stale pagination returning the
wrong error; source was corrected, and all five passed without test weakening.
Cases prove isolation/revocation, concurrent operation replay, Undo order,
A→B→A epoch progression, and preferences CAS/cursor invalidation. Database lease
was released to the next agent, preserving the task container. Test SHA256:
2d8e3deab550092b25892e0a6b65dc112f115ac65c79b7e1fa6ebbaf8dd28a0b.
Store SHA256 9381a6f2714fa78b27dc459f5fd5f28460d75861f4a07e4f5c06f6d41f6ba04b.
Existing flashcard launcher/API plus new transport selection passed14 cases:
`pnpm --filter @languon/web exec vitest run tests/flashcard-training-launcher.test.tsx tests/flashcard-training-api.test.ts tests/knowledge-vocabulary-api.test.ts`.
Integrated static checks, complete sentence modes, reusable widget hosts and
direct-practice browser journeys remain pending. Existing earlier workbook browser evidence
cannot establish these newer surfaces.

## E25 — publication epochs and restricted private-data erasure

Agent block_editor reports 16 passing real PostgreSQL tests through migration
0127: `learning-epochs.database.test.ts` (7) and `learner-store.test.ts` (9), using
the explicitly disposable `languon_auth_epochs_test` on loopback port 55559.
The exact invocation uses `ALLOW_DISPOSABLE_DATABASE_TESTS=true`, matching
`AUTH_TEST_DATABASE_URL`/`AUTH_TEST_DATABASE_CONFIRM`, and
`pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/learning-epochs.database.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/learner-store.test.ts`.
Epoch test SHA256 f270a95da91984033c4c9e6b3df1a73180e5b2416f8c9d9f066a77bb044e5f93;
learner test ad06850c6e3b12b9bcd27011555a791c3c62196e8c759b238545d03532f23cdc.

Agent knowledge_v2_persistence reports the final restricted-role
`knowledge-account-purge.test.ts` case passed through migration 0130 (4.27s).
It exercises owner/foreign-source actor cleanup for all seven new practice
tables, independent copy/media survival, queued transcription settlement before
erasure, narration scrubbing, and wrong-owner/fence/replay denial. Existing
`drizzle-account-purge-store.test.ts` four cases also passed. Necessary MCP
cleanup uses verified due-lease definer authority rather than raw table grants.
Canonical knowledge purge SQL and 0130 SHA256:
4313b2b0623e76ffe9d27e918b80b32663cebe83f9e5e85f7ebce0a60cf0ae60.
Test SHA256 c7f76357851b73ad3f5e5a8acffec31f84c52919ca8595cd068ddb0c79311e2c.
Independent security review and full critical gate remain pending.

## E26 — transcription production/accounting and administration checkpoint

Financial agent reports final `transcription-store.database.test.ts` **11/11
passed**, no skips, 23:42:45, 4.28s, through migrations124–130. Command:
`ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_workbook_v2_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_workbook_v2_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/transcription-store.database.test.ts`.
Only the external HTTP provider is deterministic; production admission,
settlement, restricted worker role, explicit quote confirmation, source fencing
and deletion concurrency execute against PostgreSQL. This replaces earlier
7/9/10-case snapshots. Test SHA256
831e8046aa594ca7b68b259640aba7d638a5695c4ca79024f22e487c53836ad1;
admission c3ef881e40247113852977ff95c52f09906f7a8c09649a8669aaf12e6022f034;
execution f3383c6bf1ee6b90ce2418e694e332fd0222cf178461c12fb73a749b1f98185e.
Scoped lint/diff passed. No real provider activation/call or publishable default
tariff is implied: known nominal model rate still lacks verified provider
minimum/rounding evidence. Operator-reviewed configuration remains explicit.

Admin selected registered stage `node scripts/run-critical-flows.mjs --flow
admin-text-ai-routing` passed two journeys/no skips in55.5s, run
`e5813ad1-1c50-446f-8b31-3944fc91ee59`, actual backend/admin/DB/Redis. Desktop and
narrow screenshots were inspected; task containers were confirmed cleaned up.
After that pass, a narrow layout overflow was fixed and required native-duration
publisher observations were added. Current guide remains draft; the final
registered stage must rerun on stabilized source. Current guide revision is
92875f40990080b5. Passing test snapshot SHA256
873f45a8fdc15c96a1545089d5e906083a41eed878fa818dd495445d8dc9db88;
new pending test SHA25630ee6e43e5ef9ba7d964cf352217822ffee6472fb59c19d9588c6706cd330342.
STT widget/API10 focused tests passed; native-price publisher two tests and admin
typecheck passed before the final CSS/test observation changes. Full shared
static checks, independent security review and full critical execution remain
required.

## E27 — independent verification preflight (2026-10-29)

This read-only preflight compared the active uncommitted patch, the registered
browser stages, the two affected user-flow guides, and the earlier evidence. It
does not approve the feature or replace its required independent reviews.

- `pnpm user-flow:e2e -- check interactive-workbooks` passed, validating the
  guide-to-test mapping.
- `pnpm docs:user-flows:check` passed: 16 validator tests and 33 mapped guides.
- Current relevant content hashes are: interactive-workbooks browser test
  `9a37be1799e41d50637e4d016b33d5b972459606b66aa226148e588079ec6ebe`;
  admin route test `30ee6e43e5ef9ba7d964cf352217822ffee6472fb59c19d9588c6706cd330342`;
  interactive-workbooks guide
  `b2879201484015a983b0ff4582db5c5c3b16982eabf132f33cd4a7d1eb999ede`;
  admin guide `5c3057feb43b4a95ea17c41e03b7850929a13dd25b49a787fca0f6f7fa96e7de`.

The former E20 browser pass is invalid for current direct flashcard/sentence
practice, bilingual Text-library publication, and workbook aggregate assertions:
its recorded browser test hash is different. The current author journey is
designed to exercise persistence/reveal, flashcard start/known/progress,
prepared-example sentence reference/review, author-prepared original/bilingual
reading, and an explicit Text-library preview/commit through the real production
composition.
`pnpm --filter @languon/web exec eslint tests/e2e/interactive-workbooks.journeys.spec.ts`,
`pnpm user-flow:e2e -- check interactive-workbooks`, and
`pnpm docs:user-flows:check` passed after this test/guide update; the browser
stage remains deliberately pending until the sentence and translation source
wiring stabilizes. The former admin
pass is likewise invalid because the current test hash differs after native
duration-price and layout assertions; rerun
`node scripts/run-critical-flows.mjs --flow admin-text-ai-routing` after the
transcription security/privacy remediation stabilizes.

No focused tests currently match the new private-translation implementation
paths (`private-translation`/`privateTranslation`) in knowledge backend or web
trees. Before the browser gate, add or identify contract/HTTP/database coverage
for private overlay ownership, source-fingerprint staleness, live share
revocation, actor deletion, billing admission/cancellation, and Text-library
publication from a current overlay. The two browser scenarios also do not cover
remote-video validation, AI proposal Apply vs Save, library append/insert,
partial-block copies, generated speech, or
STT dispatch. These require their existing focused test matrices to be rerun on
final source; selected critical browser cases should cover one representative
interactive path, not replace those database/security invariants.

Because migrations, shared contracts, root compositions, AI accounting, worker
roles and user-visible components are still changing, no earlier typecheck,
database, browser, or admin evidence is reusable as final evidence. Final order:
focused affected unit/HTTP/real-PostgreSQL suites (including restricted-role
negative cases), serialized contracts build and backend/web/admin static checks,
the two registered browser stages, then the full critical gate required for
shared auth/accounting/model/worker changes. Independent source, security and
tester reviews remain open.

## E28 — private audio processing approval remediation (2026-10-29)

The processor/privacy gate is distinct from billing verification. The code-owned
`transcription-processing-policy.ts` ships `pending-review` with no approved
revision: retention, training, residency and processor approval are not invented.
Config and job revisions pin `processingControlsRevision`; SQL dispatch requires
matching pins and the separately code-owned database approval revision. Migration
0132's approval function currently returns NULL. The provider transport checks
the approved pin again before HTTP. Keys, live worker observations, native prices,
customer tariffs and administrator billing evidence cannot approve processing.
Disabled configuration preparation remains possible. No production activation or
paid provider call was performed.

Focused checks after root serialized contracts build42475:

- `pnpm --filter @languon/contracts typecheck` — passed.
- `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/domain/transcription-processing-policy.test.ts src/modules/knowledge/infrastructure/transcription-admin.test.ts src/modules/knowledge/infrastructure/transcription-openai.test.ts src/modules/knowledge/interface/http/transcription-admin-routes.test.ts` — four files,20 tests passed, no skips. Includes unmocked default-deny policy, billing-attested API preview remaining unready, and mismatched processing receipt rejection before external HTTP. Positive transport tests explicitly replace only the processor policy with synthetic review evidence; they do not approve the real processor.
- `pnpm --filter @languon/admin exec vitest run tests/transcription-settings.test.tsx` — five tests passed, no skips. The UI explains the processor review gap and offers no approval checkbox; enabled publication remains disabled.
- Scoped ESLint over changed contracts/domain/readiness/provider/admin-form files — passed. `pnpm --filter @languon/admin typecheck` initially identified optional CSS module class names passed to strict Ant Card/Select props; empty-string fallbacks repaired those existing feature-local errors and the rerun passed.

Migration0132 SHA256 `a0ba48b45a5e76b054c731b2258d90a62cb26a04335e8d69401e11bba2857c99`;
policy SHA256 `3466e1f35d75deeb49963585720209f4afd3bb53138948cc12baf00fab851c87`;
provider SHA256 `8083efd8bd981c7d2d9d4829a17cd3b11a9a9db102bcf16beacd2ef328ec586b`;
admin test SHA256 `b5a7c5009a5c1b92e3a091e36530b6f9da90c5193faff56364c8ae6ae2925fe9`.
Actual PostgreSQL pending-policy dispatch and forged-pin regressions are included
in the financial remediation owner's database suite; its execution is separately
pending. Final admin browser observation, independent security remediation review,
backend integrated static checks and full critical gate remain required.

## E29 — Free prepared vocabulary sentence lifecycle (development checkpoint)

The note-bound sentence store copies valid authored bilingual examples into
private sentence exercises, reuses the existing sentence contracts/UI, and
persists idempotent next receipts and free reference reviews. Every transaction
resolves the current saved note grant and semantic epoch; historical reviews
remain explicitly outdated after material edits. Free reference revelation does
not synthesize an AI grade or charge a wallet. Current semantic epochs, aggregate
progress and pool counts are filtered in PostgreSQL; next reads one candidate
(or the explicitly bounded replay IDs), and history uses keyset pagination.
The source helper keeps all bounded block entries eligible; the manual-selection
limit does not silently exclude entries after the first100 in all mode.

- `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/interface/http/knowledge-sentence-free-routes.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-sentence-context.test.ts`: 6/6 passed on 2026-10-29 09:39 UTC, including sign-in, authenticated actor derivation, strict input/share-header validation, revoked-source responses, CORS and more-than100-entry selection.
- Scoped ESLint over the free service/store/history/selection/routes/tests passed; bounded strict TypeScript source+test checks passed before the final additional source-selection regression.
- `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_sentence_free_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_sentence_free_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-sentence-free-store.test.ts`: 5/5 passed, no skips, on 2026-10-29 09:37 UTC (41.91s), applying the real migration chain through134. Cases cover private prepared examples and free next/reveal replay; actor/live-grant isolation; concurrent operation replay/conflicts; semantic invalidation/history and source cascades; SQL history pagination/cursor binding. Only this dedicated disposable database was reset. The separately created paid sentence database was handed to its worker and not reset by this suite.
- Tested database file SHA256: `85d636a3c555040c2d9f6a97e98f147bf12db29eda1756d4c69b0baf01cd2b75`; HTTP file: `9bb2bbd3e9290975591c3d6046b67f7fe3bcaff790fe8c4015e1ff147eabb348`.

This is focused development evidence; paid generation/checking, consolidated
workspace checks and integrated browser journeys remain separately required.

## E30 — fenced transcription financial remediation (2026-10-29)

SEC-1/SEC-2 remediation adds an opaque per-claim capability retained only in the
internal lease and a SQL table denied to worker credentials. Worker names,
fences, job IDs and issued receipts remain insufficient to read another lease's
audio, renew it, dispatch it, publish its transcript or attach observations.
Restricted worker UPDATE on transcription jobs and EXECUTE on the old standalone
observation/settlement/read/dispatch functions are revoked. Fenced security-definer
operations own claim, heartbeat, audio read, dispatch, atomic publication plus
attempt/action settlement, and expired-work recovery. The feature table now has
the existing deferred feature/action-authority consistency constraint.

The original executor may retain a late provider usage observation after a
cancelled job, using its immutable dispatch witness and private lease capability;
it cannot republish the transcript or change the customer's terminal settlement.
Source deletion still settles pending actions before cascading private payloads.

Focused final command used the explicitly disposable loopback port55559 database
`languon_auth_workbook_v2_test`, synthetic local credentials and
`ALLOW_DISPOSABLE_DATABASE_TESTS=true`, with matching
`AUTH_TEST_DATABASE_URL`/`AUTH_TEST_DATABASE_CONFIRM`:

`pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/transcription-store.database.test.ts src/modules/knowledge/application/transcription-worker.test.ts`

Result: **17/17 passed**, two files, no skips, 54.28s, migrations through0134.
The twelve real PostgreSQL cases include the actual deployed restricted worker
role and two valid issued jobs/leases: raw terminal writes and hidden capability
reads fail; enumerable real worker/fence plus another token fails; another issued
receipt cannot poison an observation; the original worker completes with exact
customer/provider settlement. A migration-owner raw terminal publication without
settlement also fails at the deferred constraint. Both migration-owner and actual
restricted-worker dispatch remain blocked when the separately code-owned
processing approval is absent, despite valid billing/credentials/source pins.
Positive execution explicitly uses a synthetic test-only policy and replaces
external HTTP only. No real processing approval, activation or paid call occurred.

Scoped ESLint passed over the modified lease/worker, execution, terminal,
worker-source and database-test files. The existing account-purge test's positive
STT fixture was adapted to an explicit synthetic policy and pin; its execution
belongs to the purge integration owner, not this result.

Tested hashes: migration0131
`14b814db2643f4428f48de42d98785d6f06841b8007033637f7f391a77b07cee`;
migration0132
`595697148a6ad07a651744ac75c803944c3b7a9a9b331e93be76a6157d890f1c`;
migration0133
`c3e6f51303794285480b773507c733308bf1b4c8fcaa7ba7248ddf65f183afef`;
migration0134
`4705b3d147f431e799795ee9adf481e70248d074f3edfa0923ef4a256a261bb9`;
restricted worker grants
`6b1c745f001dac81ca89a4e0cdeae80a0d50fb58d82276b9e599061d9dd859b6`;
database test
`49d1ef7171019b81be2a0dae8cddf9b4b2b287dc3b98c7ff4e39880078058493`.

Earlier development attempts were invalidated by the new privacy pin lacking its
synthetic fixture, stale built contracts, metadata regeneration during migration,
duplicate handwritten/generated processing-column additions, and a role grant to
the not-yet-installed source-authority function. These were setup/integration
failures, not passing evidence. Tool-generated metadata was regenerated centrally;
handwritten0132 leaves column creation to generated0133. The final run above
exercises the resulting complete chain. Independent SEC-1/SEC-2 remediation source
review is pending; consolidated static checks, full critical gates and complete
feature security review are still required.

## E31 — restricted private learning job purge (2026-10-29)

The due-claim security-definer
`languon_quiesce_knowledge_learning_for_purge` stops the deleting learner's
Knowledge-bound Text/Sentence jobs on foreign sources and other learners' jobs
on that author's notes. It accepts no job ID, outcome or provider meter from the
restricted worker. Under the existing global admission and actor/accounting
locks it settles outstanding provider attempts conservatively, publishes an
access-revoked cancellation with a new fence, and settles the customer action as
failure with zero charge. The account purge calls it before generic busy checks;
source cascades happen only after settlement. Canonical owner cleanup also erases
actor-private translation overlays/source links and the eighth sentence-next
receipt table. No raw content or financial mutation grant was added.

Focused checks used the separately created disposable
`languon_auth_learning_purge_test` on loopback port55559, with
`ALLOW_DISPOSABLE_DATABASE_TESTS=true`, matching test URL/confirmation and synthetic
local credentials. No other database was reset:

- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/knowledge/knowledge-learning-purge.test.ts`: **1/1 passed**, no skips, final run 09:41:31 UTC, 24.45s. The migration ledger confirms migration0135 hash
  `116173443a8e955587dc2846c1b4a4e2f3e827d376d0e1df0ad5f47f70f31305`.
  The real Texts admission, finite customer holds, claim and dispatch execute
  against PostgreSQL. The deployed restricted purge role completes the account
  lifecycle. Assertions cover raw read/write denial, wrong worker/owner/fence,
  post-completion replay, foreign-reader cancellation/refund, retained settled
  unknown provider attempt, actor-owned job erasure, overlay cleanup, independent
  note/control-job survival and stale worker lease rejection. No provider HTTP
  call is made.
- `pnpm --filter @languon/backend exec vitest run tests/integration/modules/knowledge/knowledge-account-purge.test.ts`: **1/1 passed**, no skips, 09:40:15 UTC, 51.63s, through migration0134. The existing broad restricted lifecycle now
  includes all eight practice tables, narration and queued transcription using
  the explicitly synthetic processing-policy fixture, plus independent copied
  media/source survival and MCP cleanup denial checks.
- Scoped ESLint over both tests and `account-purge-completion.ts` passed. The
  bounded TypeScript run found no errors in these files, but failed in transitive
  Mastra tool registration, Texts provider schema inference and nullable sentence
  dictionary receipts; their owners were informed. This is not a typecheck pass.

Initial execution was denied by the filesystem/network sandbox (loopback EPERM);
the approved loopback retry used the same isolated database. The first real run
failed because the synthetic routing fixture omitted its pinned credential
fingerprint. Adding the existing `fixtureRouteFingerprint` corrected the fixture;
the real source/financial checks were retained. The final rerun additionally
proved cleanup of three private overlays across actor/source/copy ownership.

Tested hashes: new purge test
`71b2e75f16fdb88857b542b4d24de4cac72ce359ab763cc1dcf08751657419f5`;
existing purge test
`cc1ab0f5fb98750465060660257a293c08f22d8093c33344b6a4516538a10cc0`;
quiesce SQL
`5374be3f27c605c0265426d10267d5e68dac912dc4c03e1683dbfbcda07af89c`;
owner cleanup SQL
`288e8e6741f455edb607383ac1705c102ffdc000ede67101116a292b4bbdaf10`.
Both canonical SQL files are included byte-for-byte in migration0134. Independent
security review, consolidated static checks and final critical execution remain
required. The companion paid-Sentence suite separately exercises the Sentence
branch with a real due claim; its owner records that evidence.

## E32 — private vocabulary AI sentence lifecycle (2026-10-29)

Knowledge vocabulary now supplies an explicit source to the established Sentence
admission, provider, worker, accounting and settlement engine. The source jobs
have a null dictionary ID and an immutable note/block/actor binding; they do not
create dictionaries or weaken dictionary/card foreign keys. Generation and
feedback publish into learner-private Knowledge tables. Source authority is
checked at admission, worker claim, fenced dispatch, result publication and
readback. Source deletion settles and fences pending jobs before erasure.

Command: `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_sentence_paid_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_sentence_paid_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-sentence-paid.database.test.ts`.
Final run63342: **4/4 passed**, 57.39s, no skips. Each scenario resets only its
isolated disposable database and migrates forward through0135. This proves:

- Real Sentence provider/SDK execution with only external DeepSeek HTTP replaced
  by deterministic responses, then persisted usable private exercise and answer
  feedback; the requesting reader owns both settled financial actions.
- Revoked sharing blocks private result reads and terminalizes the old worker
  before dispatch; queued source cancellation settles without a successful charge.
- A due source-owner account purge cancels a foreign reader's running action and
  changes its worker fence while an independent copied note's queued action survives.
- The deployment worker role can claim, dispatch and publish a private exercise
  through its grants, and cannot update the source sheet's title.

Scoped ESLint over the thirteen changed Sentence runtime/source adapter files
passed (54451); the test file lint passed after its final restricted-role case.
`git diff --check` passed for the changed Sentence source. Existing sentence-domain
and worker-service unit selections passed46 cases (28118); the new database test
was explicitly skipped in that unit-only selection and is proved by63342 above.
The earlier three-case database run99287 passed through0134 but is superseded by
this final four-case run after the source constraints migration.

Relevant SHA256 hashes: paid database test
`8418cc6d87cf635e112bb441490921f4edf36c091aac75ef2db75888c75b073c`;
paid source store
`84567955477d312b5de0f5e5e2315b53102c69c2312a5228270958784b071515`;
canonical source authority SQL
`ef50f26b36b6a44fcac63a3496533ef171785e962ea54be0580e3fc0e74d9e46`;
migration0134
`4705b3d147f431e799795ee9adf481e70248d074f3edfa0923ef4a256a261bb9`;
migration0135
`116173443a8e955587dc2846c1b4a4e2f3e827d376d0e1df0ad5f47f70f31305`;
restricted worker grants
`6b1c745f001dac81ca89a4e0cdeae80a0d50fb58d82276b9e599061d9dd859b6`.

Full workspace checks, the final registered browser journeys and independent
completion/security review remain required. No paid or live provider call was made.

E32 static remediation: the legacy malformed-generation-payload database test now
asserts that its fixture has a retained generation payload before enumerating it.
Its deliberate malformed-object cast goes through `unknown`, preserving the
runtime constraint rejection assertions after Knowledge terminal inputs became
nullable. Scoped ESLint passed93273. The same disposable sentence database command
with selection
`tests/integration/modules/learning/infrastructure/drizzle-sentence-stores.test.ts -t 'rejects missing/mismatched generation policies in persisted jobs and exercises'`
passed the one selected regression72774 (7.36s);34 unrelated cases were excluded by
the explicit filter. This is focused remediation evidence, not a full Sentence
suite run.
Tested test-file SHA256:
`f0899c93aca96d21de0b2020e82d608cfd66ad8a55da69b3bb25fcfa4c8ecdae`.

## E33 — transcription confidentiality remediation and current restricted-role proof (2026-10-29)

Independent bounded security review found SEC-4: the initial transcription worker
SELECT grant included completed private transcript results across authors.
Following that review, worker SELECT is restricted to fourteen queue/lease metadata
columns, and the three execution queries use an explicit thirteen-field
projection. The audio reader requires only its narrow source/lease fields and
retains private-capability authorization. Workers cannot SELECT completed results
or wildcard rows. The regression creates another author's real completed job,
then proves both reads fail while the deployed restricted worker still claims,
dispatches, observes, publishes and settles its own operation correctly.

The E30 run is historical: its role, projection and test hashes were invalidated
by SEC-4 remediation. The same exact two-file command recorded in E30 was rerun
against disposable loopback55559 `languon_auth_workbook_v2_test` through migrations
0136: **17/17 passed**, no skips, 37.13s (run44036, 2026-10-29 09:49 local process
clock). This retains all twelve real PostgreSQL cases and five worker cases,
including the actual deployed non-owner worker role, cross-job receipt/token
rejection, original-executor late observation, atomic settlement, deferred raw
publication rejection and code-owned processing approval denial.

Current tested hashes:

- Migration0131: `14b814db2643f4428f48de42d98785d6f06841b8007033637f7f391a77b07cee`.
- Restricted worker grants: `56de0d5952c562ba7234e340edacdf2ce1f76c4ee49fd05d1c62a734ef088409`.
- Execution projection: `534feb71b0d93726353b0c839f7060c579582348a0865ab846d51269f0c0cbe2`.
- Audio helper: `7a05004779ba4c188260d5216ef7eaa63e673bbd9035cd11f1748f95856d26f9`.
- Database regression: `58244e6b4e983c53362066e5affef9f586604cd7175354c0d34c4407761aac7b`.
- Migration0135: `116173443a8e955587dc2846c1b4a4e2f3e827d376d0e1df0ad5f47f70f31305`.
- Migration0136: `ca59377910d291121382e804d51a1f06c2ccc242e2ab30631ac263905b358ac5`.

Scoped ESLint passed for the changed execution/projection/helper/test files.
Focused worker/environment checks also passed seven cases after correcting the
required languages argument and narrowing the readiness publisher to its only
required database method, insert. Consolidated backend typecheck belongs to the
root final checks. No paid calls or production processing activation occurred.
The independent reviewer matched these exact hashes to run44036 and closed
SEC-1/SEC-2/SEC-4 for the reviewed source and focused evidence. Full feature
security review, static/critical gates and later source changes are outside this
bounded approval; any migration0137 privacy changes require separate review.

## E40 — private reader translation browser registration, pending execution

The registered shared-workbook scenario now creates an author-prepared Spanish
translation, confirms anonymous readers have no private-translation control, then
uses the authenticated workbook route to request a separate French overlay. It
handles a reduced-action consent if offered, waits for the durable private overlay,
and verifies deterministic French output. It also verifies that the owner's saved
source stays Spanish and a second signed-in reader has no first-reader overlay.
The fixture uses real authentication, share headers, Texts job/admission/accounting,
worker, PostgreSQL and restricted source authority; only external provider HTTP is
deterministic and deny-first.

The translation owner reports two parameterized ordinary/restricted-role SDK/worker
cases passing. The full `texts-job-store.test.ts` suite contains 17 cases, so
`ai-execution-contracts` now includes it and its threshold is 378 (361 + 17), with
both exact restricted-state titles pinned. This prevents unrelated Texts cases from
satisfying the new production witness.

Current browser test SHA-256:
`215399740f6941118188890a6f9f1e10d23a31131583c5392444af9f1cbc203c`.
Current guide SHA-256:
`af53f99ce2d884a8e8c26b3c4cea20dded2a0e5e84dfc53b71637ee4215e9a32`.
Scoped browser-test ESLint, guide mapping and user-flow validation, and the critical
registry test pass. The registered browser stage is deliberately pending the
coordinator's stabilized contracts/fixture preflight; no browser-success claim is
made here.

## E35 — consolidated author preflight (2026-10-29)

Root ran the following against integrated source through migration0136, before
the subsequent credential-bound processing-attestation delta. These are focused
preflight results; independent completion review and broad final gates are pending.

- `pnpm --filter @languon/contracts exec vitest run src/learning-blocks.test.ts src/knowledge-interactive.test.ts src/knowledge-library-copy.test.ts src/workbook-learning.test.ts src/knowledge-vocabulary-practice.test.ts src/audio-duration-pricing.test.ts`:48/48 passed (0.486s).
- `pnpm --filter @languon/web typecheck`: passed (session61995) after omitting
  an undefined optional fetch signal in the transcription client.
- `pnpm --filter @languon/backend typecheck`: passed (session37840). The first
  consolidated run found nine source/test compatibility errors; these were fixed
  by their owners and root before this successful rerun. New browser fixture and
  later privacy fields still need their affected checks.
- `pnpm --filter @languon/admin typecheck`: passed (session97216).
- `pnpm --filter @languon/web exec vitest run knowledge- workbook- learning-blocks shared-knowledge-assistant-actions generic-assistant-request --maxWorkers=2`:
  30 files,123/123 passed in30.78s (session73410). An earlier unbounded parallel
  run passed122/123 with the unchanged maximum-document test timing out under
  contention. Its isolated seven-case suite passed in4.68s; the bounded complete
  selection then passed without increasing any timeout.
- `pnpm --filter @languon/backend exec vitest run src/modules/conversations/infrastructure/ai/contextual-tutor-tools.test.ts src/modules/conversations/infrastructure/ai/contextual-tutor-runner.test.ts`:
  28/28 passed in3.82s, including the real SDK typed-block tool path.
- Scoped ESLint selected451 tracked/untracked changed source/test/tool files.
  Only11 blank-line errors were reported in three files; their targeted
  `eslint --fix` passed. A final complete check remains required.
- `pnpm db:check`: passed through the generated/custom chain135. Later136/137+
  require final migration consistency checks and real disposable execution.

The Mastra registration adapter now constructs schema-bearing executable tool
descriptors from exactly the authorized tool set, avoiding the SDK class's
strict-optional declaration mismatch without type assertions or wider tools.
Legacy tool and speech-sharing fixtures now narrow the explicit source union
before inspecting type-specific fields, retaining their original assertions.

The changed-file formatting check found19 files needing formatting; this is
recorded as pending until active source writers release their files. No formatter
error is treated as runtime proof or waived.

## E34 — Private reader translations and independent Text publication

Development evidence, 2026-10-29, base `bb9b40b` plus current feature patch.
AC-6/9/10/16/18/19/20/21. This is not final feature approval.

Implementation reuses the existing Texts admission, action budget, native HTTP
receipt, worker, SDK, cancellation and settlement pipeline. A saved-note binding
pins actor, original segment identities/content and verified grant digests; no
raw sharing key enters jobs. Results publish to learner-private overlays, never
the note. Permanent source deletion cancels and settles pending bound jobs before
erasing excerpts/results; a retained parent source tag prevents standalone-read
fallback after its link cascades. Private Text-library copies pin the overlay
fingerprint and update timestamp through preview/commit and remain independent.

The deployment worker receives only a boolean source-availability operation and
a narrowly scoped publication function. Publication requires the exact persisted
completed result, successful settled action/attempt, immutable worker/fence
witness and current source authority. It cannot publish an unpaid running result,
read private overlays, update their rows directly or edit note content. Its
ordinary completion transaction publishes the private overlay after settlement.
Older completed-job replay cannot replace a newer overlay.

Focused results:

- `pnpm --filter @languon/contracts exec vitest run src/knowledge-private-translations.test.ts`
  — 2/2 passed (`77231`). Supported target languages and strict source-free request
  boundaries, plus an explicit private-library version pin.
- `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/interface/http/private-translation-routes.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/library-copy.test.ts`
  — 8/8 passed (`60865`), including authentication, header-only sharing credentials,
  unsupported input rejection and unavailable/revoked job responses.
- `pnpm --filter @languon/web exec vitest run tests/knowledge-private-translation.test.tsx tests/knowledge-private-translation-api.test.ts`
  — 6/6 passed (`79655`). Explicit generation, original preservation, private
  cached-data concealment after access failure, uncertain-submit idempotency and
  structured budget offers. Hook notifications use an awaited observable state.
- With disposable-infrastructure opt-in and the separately created
  `languon_auth_translation_test` database on loopback port 55559:
  `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/private-translation.database.test.ts`
  — 5/5 passed (`7864`) through migration135: actor isolation, stale source hiding,
  live grant revocation, source-derived input, disabled generation, exact private
  preview/publication pins, rollback on a changed overlay, source/actor erasure
  and independent saved Text survival. Migration136 adds a publication function
  exercised by the next check; it does not alter these table/read/copy cases.
- On the same isolated database:
  `pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-job-store.test.ts -t 'private shared-note translation'`
  — exactly 2 selected cases passed (`2207`, 10.28s); the other 15 existing cases
  were outside this focused selection and are not claimed as executed. Both
  ordinary and deployment-role paths use the production SDK and real admission,
  dispatch, native HTTP accounting, worker, persisted private overlay and credit
  settlement. Only external provider HTTP is synthetic, with a strict origin,
  path and method guard. Outbound token caps are observed. The role case also
  rejects raw private reads/writes, note edits, premature publication and a
  different worker/fence. Source revocation denies completed-job reads.

Fixture diagnosis retained: the first HTTP-only fixture mistakenly supplied the
provider's readiness-fetch option, which does not replace SDK execution fetch.
An invalid synthetic fixture credential and synthetic `Hello world.` source
reached DeepSeek and received HTTP401; no real credential or billable successful
call was used. The fixture now replaces global external HTTP only for the SDK
call, denies unknown targets and restores it afterward. Early admission failure
also exposed a missing route fingerprint in this old Texts test fixture; the
reviewed fixture fingerprint is now supplied. These failed attempts are not
completion evidence.

Relevant tested file fingerprints:

- SDK/role regression file: `b8df5b5fc9f9a257529b4946299104a62be0f46942832eaac4bbba683275d3a4`.
- Migration134: `4705b3d147f431e799795ee9adf481e70248d074f3edfa0923ef4a256a261bb9`.
- Migration135: `116173443a8e955587dc2846c1b4a4e2f3e827d376d0e1df0ad5f47f70f31305`.
- Migration136: `ca59377910d291121382e804d51a1f06c2ccc242e2ab30631ac263905b358ac5`.

Browser composition is now saved in
`apps/backend/tests/support/knowledge-private-translation-fixture.ts` and mounted
by the contextual assistant fixture: real route, Redis limiter, Texts admission,
worker/SDK and settlement, with only external HTTP replaced. It starts a bounded
private translation worker and joins it before closing infrastructure. Its source
hash at this checkpoint is
`e7df9d2cca5d5ffeb18468ef57dfa6e19af4cf5a0f02cc3670ade01063f05a03`.
Real registered browser assertions and final consolidated gates remain pending;
static browser-fixture verification is in progress. No live paid provider smoke
or production transcription/translation activation is authorized or claimed.

E34 static readiness update: bounded backend TypeScript check `65096` passed with
an ephemeral config extending the real backend tsconfig and selecting the new
browser helper, contextual assistant fixture, SDK/role regression file and private
translation database tests (including their production dependencies). The initial
config under `/private/tmp` could not resolve project type libraries; the corrected
app-local ephemeral config passed and both temporary configs were removed. Scoped
fixture/source lint `63583` passed; final no-op formatting does not change its
behavior. Root's consolidated web typecheck and focused browser tests are tracked
in their owning evidence entries. Registered private translation browser execution
remains pending and cannot be inferred from this static readiness result.

## E36 — engineering-reviewed transcription route and credential-bound account attestation

This supersedes E28's intentionally temporary, permanently pending technical
processing policy. The independent financial/security reviewer conditionally
accepted a truthful engineering review before implementation, requiring separate
actual-account attestation, credential binding and bounded renewal. It is not
provider approval, legal/DPA approval, a ZDR account entitlement or a regional
processing guarantee.

Official evidence retrieved2026-10-29: [OpenAI endpoint data controls](https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint).
The transcription endpoint table reports no training use, no abuse-monitoring
retention, no application-state retention and ZDR eligibility. Training remains
subject to organization opt-in; provider terms and account-specific controls are
not replaced by this endpoint summary. The fixed global endpoint promises no
region. Source snapshot SHA256
`16e953514150dd5cbf2c599868ca14253c3b8d78cd7268e950a6f665418565ed`.
The code-owned revision pins provider/model, endpoint, direct multipart transport
without Files API/fallback, source/date/hash and these qualifications.

Actual account settings remain unknown until an authenticated owner explicitly
attests that the configured organization/project has not opted into training,
records evidence and publishes the signed configuration. This separate checkbox
is false by default and cannot approve the technical route. Each publication
requires a fresh checkbox/evidence; loading previous settings does not renew it.
Attestation expires after30days. A server-derived credential equality pin is
stored privately in immutable config/job rows; it is never accepted from or
returned to HTTP callers or logged. Rotation invalidates signed previews and
readiness/admission. Fenced SQL dispatch checks the actual worker credential pin,
and the adapter compares its current key again immediately before HTTP. Existing
billing, explicit enablement, bounded expense and credit-confirmation gates remain.
No production configuration was enabled and no paid call occurred.

Generated137 adds account-attestation/private credential columns. Generated custom
138 installs the reviewed technical revision, SQL attestation/pin checks and the
new credential-bound fenced dispatch; the old signature fails closed. Generated
SQL/snapshots were not edited manually. Root serialized contracts build14192 passed
JS and declarations; contracts typecheck8342 passed.

Focused checks on this implementation:

- `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/domain/transcription-processing-policy.test.ts src/modules/knowledge/infrastructure/transcription-admin.test.ts src/modules/knowledge/infrastructure/transcription-openai.test.ts src/modules/knowledge/interface/http/transcription-admin-routes.test.ts` — four files,24tests passed, no skips. Covers separate technical/account review, expiry/key rotation, signed-preview invalidation, caller fingerprint rejection and pre-HTTP credential mismatch.
- `pnpm --filter @languon/admin exec vitest run tests/transcription-settings.test.tsx` — final six tests passed, no skips, including fresh account re-attestation rather than renewal from prefilled settings.
- `pnpm --filter @languon/backend typecheck` — full backend passed1512.
- `pnpm --filter @languon/admin typecheck` — full admin passed6520. The final checkbox reset preserves field types and has the focused six-test runtime result above.
- Scoped ESLint over24 changed contracts/backend/admin files passed99357 before the final checkbox reset/test addition.

SHA256: migration137
`4fb9f8e79dd3dd31dbbb49a191a4a7ddfff0a40881889532a577c119e80b56a8`;
migration138 `bbb62ee28e5782bcdc5d8ccb092d1ace17f3de766bef1748ad2699402c332a86`;
policy `ede1e10eb623a580ee0484076dcef2f94147233fa42f7795d5f8456915c7e4d3`;
provider `3a69b05ddb3cb7d71f257399ded3d4a1cba932e213ba13fe19ccf6d9efac1887`;
preview proof `ec718bae11c63e4b24dbf74cfe41d3fc5ec57b8f87959b97ca0677b94c2e86a7`;
admin form `00443af872026bfe49d7084544e38f8998fb552c927e132d854ac1a7826a4e07`.

Real PostgreSQL financial/restricted-role, private admin serialization and account
purge fixtures are being adapted and executed by the financial owner; their
results are not claimed here. Stabilized-code security review, final admin browser
observation, traceability and full critical gates remain pending with root.

### E34 review remediation checkpoint — REV-02/03/06

Later review changed the private Text-job projection and publication authority;
the earlier single-passage SDK result above is historical development evidence,
not a claim that the revised multi-passage publisher has passed. The financial
specialist owns SEC-5 publication authority and its additive migrations. A new
actual-SDK two-passage test now also verifies private-overlay-to-Text preview and
publication; it awaits that SQL integration.

- REV-02: owner workbook copying now rejects the entire transaction if any member
  remains a draft. The query freezes all members before deciding; nothing is
  silently omitted or implicitly published. The owner UI explains the condition
  and disables copying in all four locales. Shared copying still exposes exactly
  the saved material authorized by the share, without private draft inventory.
  `pnpm --filter @languon/web exec vitest run tests/workbook-copy.test.tsx`
  passed 2/2 (`54895`). Independent completion review confirmed source and focused
  evidence close REV-02; registered browser evidence remains with its owner.
- `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/workbook-store.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/private-translation.database.test.ts`
  passed 14/14 on the isolated translation database (`32928`): seven workbook
  cases include atomic draft-member rejection with unchanged workbook/note rows,
  and seven private-translation cases include source/actor isolation, explicit
  `\n\n` passage boundaries with contiguous offsets, and rejection of an
  author-prepared target before the burst-admission callback or any paid job.
- REV-06 UI: eligible private targets exclude the source and every author-prepared
  translation (case-insensitively); the initial selection is eligible, and there
  is no paid action if no eligible target remains.
  `pnpm --filter @languon/web exec vitest run tests/knowledge-private-translation.test.tsx tests/knowledge-private-translation-api.test.ts`
  passed 8/8 (`42322`).
- Generic Text publication now reauthorizes a Knowledge-bound proposal through
  `authorizeTextsJob`, closing the ordinary Text-create path after source
  revocation. The prior single-passage SDK/role selection passed both added
  revocation assertions (`26041`). The expanded multi-passage version will be
  rerun against the hardened publication authority before final approval.

REV-02 tested source fingerprints: workbook store
`668d59638f5197006134b8559b508cbc25c7f3b1eb4124bb519300dcf82d3853`,
workbook DB regression
`6a35f889bb79eedd07bd0d28d0142afc6e8a4768b72ad7dd79087b73128a55a6`,
owner UI `57537009d6a74fbc5c5aa41fea9fcd1befced3ae98639cd558d9ed4f0121356e`,
four-locale labels
`51cedef2b40664e04745dd7b346e81a9607b4d553642a1acc265ae10148467e4`,
UI regression `d3271592d1686f7ef1b838af2f5754c9b75fa63e11d463acd8ff2ced25dfa3b4`.
The private DB and UI regression files at the above runs were respectively
`3f86bffa3367c9176f2d4ca624161a619c92d154984ef48b69b6711e6bbfbc5e`
and `f383ebc92f6de827733e8ba98d5cf32fc1fe8d43529767fbc2e9507427d2d63f`.

E34 final focused UI remediation selection:
`pnpm --filter @languon/web exec vitest run tests/knowledge-private-translation-view.test.tsx tests/knowledge-private-translation.test.tsx tests/knowledge-private-translation-api.test.ts tests/workbook-copy.test.tsx`
passed 11/11 (`85496`). The added view regression renders a valid 63k-character
original alongside an independently bounded private translation whose combined
presentation exceeds the publishable block's 80k aggregate limit. The reusable
bilingual presentation renders these already validated passages safely without
widening any persisted-block schema or changing the original. This avoids a
render-time exception for valid larger private translations. Existing ordinary
LearningBlockView validation remains unchanged. Target changes key the private
presentation by target language so its bilingual control starts with the correct
translation. Scoped source lint `91430` passed for the REV-02/03/06 changes;
final added presentation lint is tracked by its subsequent run.

## E39 — one-shot private Text publication, confidentiality and retention (2026-10-29)

SEC-5 remediation uses an immutable requested-target pin and source binding,
a private per-claim capability minted inside the real claim transaction, and a
hidden one-shot publication receipt. Completion requires the current unexpired
job/capability/worker/fence, exact bounded proposal/source/alignment/target, and the
same successfully settled native attempt and credit action. Database time stamps
the atomic receipt, private overlay and terminal publication. The old publisher
signature cannot be used by a worker. A successful transaction consumes its token;
a rolled-back transaction consumes neither token nor receipt.

The completed queue row immediately redacts both source input and result. The
exact validated result is retained in the hidden receipt for authorized owner
readback; the worker cannot SELECT either hidden authority table or invoke an
owner hydration definer. API hydration rechecks the authenticated actor and live
source. Receipt job/actor/note foreign keys erase it with the associated source or
account. Its retention deadline is authored from database time at completion and
bounded by the original job expiry. Bounded cleanup uses this immutable deadline,
not a worker-writable clock or parent field. Private parent updates use a default
deny row comparison: new columns are immutable unless explicitly allowed for
lifecycle, validated accounting or authenticated Apply. Terminal facts, admission,
source, identity, target and retention cannot be rewritten by worker credentials.

Final focused command (disposable isolated loopback55559 database
`languon_auth_translation_authority_test`, explicit disposable opt-in and matching
confirmation):

`pnpm --filter @languon/backend exec vitest run tests/integration/modules/texts/texts-job-store.test.ts -t 'executes a private shared-note translation'`

Run55632: **2/2 selected cases passed**, 15 unrelated cases filtered, 8.09s
(import2.18s, test bodies5.80s). One case uses the normal database authority; the
other constructs the deployed non-owner worker role and drives the real SDK,
native provider observation, accounting, claim and completion composition against
fake external HTTP only. No paid calls occurred. Product lease/worker deadlines
and the test watchdog were unchanged.

The actual-role case proves denied hidden-table SELECT, another real current
job's token, wrong target/source identity/ordered passage output/fence, raw
completed-result rewrite, future completion time, future/past parent expiry,
repeat publication, capability reissuance and the old caller-time publisher.
It also completes a valid publication inside a deliberately rolled-back financial
transaction, checks that the token and receipt remain unconsumed, and then
completes normally. Completed worker-readable input/result payloads are NULL.

Both cases prove two original passages with structural paragraph prefixes in the
model projection, unprefixed independently usable private overlay passages,
private translation preview/copy into a real independent Text with preserved
paragraphs, authenticated hidden-result GET, positive generic proposal hydration
and Apply to that real saved Text/version, and source-access revocation denial.
The positive loader assertion closes REV09; the negative revoked read runs after
that real Apply. Existing source and another actor remain unchanged.

Tested hashes:

- 0140: `46275f36f972aa9e120160424afc874bed34825505e97039fab1d17458769c21`.
- 0141: `b9bd2fd1787cdd9f77cd28e3bc583d74ee7b66be513eb99aaa5fa01faae7d84d`.
- 0144: `6ef6b91bf01f5d2751b438357baa740597ddd749e233e8ead1d26a934740a2cd`.
- Canonical publication authority: `9048ce18383c2bd7bfb2338cc7b36009e10c64fb65891d5bf2536c3cd9f0ebf4`.
- Private receipt/API persistence: `f2f27bdf8620bab74baef674f3fcb86d1dc8415e765d53227170d7a8fb59e3e5`.
- Worker grants: `29d186c7c811497357b1cb807e9a2daac044bb92ec227a8d3a71b3a75ac1af66`.
- SDK fixture: `0342a1932e703a6614a1b92c62227a3f6b58da814b6f99d7f9130938216b12f6`.
- Restricted authority probes: `416cd86879ebfa257088d89c94733105d06f8d288a83bb60858453a26f742881`.

Scoped ESLint passed across the modified source and tests. Earlier runs exposed
host contention/watchdog failures, missing explicit generic bookkeeping fields,
a JSON subtraction precedence defect and a test-only undeclared identifier;
those are failed development attempts, not evidence. Serial execution exposed the
actual defects without increasing runtime deadlines. Migration0141 remains the
frozen baseline;0144 carries the forward confidentiality/retention/function fix.
At this Text-specific run,0143 was the Sentence owner's generated placeholder;
subsequent Sentence SQL or role changes require combined final verification.

The independent security reviewer approved bounded SEC-5 source and this exact
focused proof. Full critical/static/feature gates and future source changes are
not approved by this entry. STT0138 financial/account/purge verification is now
owned by the transcription-privacy worker and remains separately tracked.

## E38 — final transcription account/credential boundary and purge database proof

The real database fixtures now use the actual code-owned processing revision and
production policy functions. Earlier test-only policy mocks/approval overrides
were removed from normal setup. Only external transcription HTTP is replaced;
keys, account-review evidence and billing rules are explicitly synthetic. The
store and production adapter derive the same credential fingerprint from the
actual synthetic key. Configuration attestation time exactly matches its immutable
creation time. No production activation or paid provider call was performed.

Command on the exclusively assigned disposable PostgreSQL database at55559:
`ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_workbook_v2_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_workbook_v2_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/transcription-store.database.test.ts src/modules/knowledge/infrastructure/persistence/drizzle/transcription-admin-store.test.ts tests/integration/modules/knowledge/knowledge-account-purge.test.ts`.
Vitest serializes files; each suite owns its documented reset. Financial Text SDK
work released the execution/database slot before this run.

First run3982 passed19 and failed3. It found an actual private configuration grant
and a replay comparison defect: the worker's whole-table configuration read
exposed the credential pin, and newly ordered config fields caused an identical
canonical request to conflict on JSON property order. The deployed role script
now denies raw config/state reads; all needed authority remains in definer
functions. Replay compares schema-normalized input. Dispatch authorization now
returns a safe domain error so Drizzle's SQL parameter diagnostics cannot carry
private credential or lease pins out of this boundary. Negative tests also assert
the actual underlying SQL rejection independently, rather than relying only on
the sanitized error.

Rerun88663 passed **22/22**, no skips, in12.87s, through the migration chain ending
0145:13financial/actual-worker tests,8admin-store tests,1restricted account-purge
lifecycle. Coverage includes:

- changed admission credential, expired account attestation and no action/receipt allocation;
- current restricted worker key mismatch, old dispatch signature denial, raw credential-pin read denial, private lease and exact receipt fences;
- production admission/worker/fixed adapter success, exact customer settlement, unknown provider duration, controlled failure/refund, late observation and deletion concurrency;
- immutable account review, private fingerprint storage with no fingerprint in admin readback, renewed-credential readiness rejection, atomic audited configuration publication and idempotent replay;
- restricted due-lease erasure of attached STT/learner/chat state while independent copies remain usable.

`pnpm --filter @languon/backend exec vitest run src/modules/knowledge/application/transcription-worker.test.ts src/modules/knowledge/domain/transcription-processing-policy.test.ts src/modules/knowledge/infrastructure/transcription-admin.test.ts src/modules/knowledge/infrastructure/transcription-openai.test.ts src/modules/knowledge/interface/http/transcription-admin-routes.test.ts`
passed29tests in5files73610. Scoped ESLint initially required one blank line in the
new sanitized-error branch; after that whitespace fix it passed48222.
`git diff --check` passed. The final whitespace-only source delta does not change
the tested execution. Root owns the final backend static/build/browser/critical
gates and independent evidence approval; these are not waived by this result.

SHA256: financial test
`c72917dec7682725d1be3e02da033a84a374160076aa7eede840daeaefc869d5`;
admin-store test `585eba0b321ee617e4d5c723085e0325929edccefbf629a1cef8021e422f68c4`;
purge test `eeb54f5647fcc0d748d29f95bc0d3aa15e980b571719f1f934d1d74bcfbd496b`;
admin store `d17da17a2cbd2a2a83e0997e24ae8682d5979d63868b217fcc57d5e90f247638`;
execution `6493477446695027f19f96d30a4fe6a65643917832080ae1c298d9da4a0fedf8`;
worker grants `ca5984081bb6abd00207cb4837ec025852fcf15442d1bc8fa16f9c2f54868d7b`.

## E42 — Private sentence app-only provenance and terminal cleanup

2026-10-29, SEC-6 app/history half, after the worker capability boundary in E37.
The normal Drizzle generator created migration 145 (one app-only source table with
its constraints, foreign keys and index); custom migration 146 installs lifecycle
functions. Metadata and snapshots were generated by the tools. No live shared or
production database was touched.

`knowledge_sentence_job_sources` retains the exact actor/job/note/block, original
binding, full admitted input and source-exercise identity. Admission attaches it
inside the same transaction before financial reservation. An immutable SQL guard
checks that it matches the admitted parent input and authority. The app rechecks
this link's actor and live source/grant on job reads and operation replay, so it
can authorize private history after parent bodies are cleared. There is no
standalone-job fallback when the link is absent.

The active parent input remains app-only for the existing financial input witness;
the execution role cannot read its raw table and receives private input only from
its unpredictable, live-lease capability getter (E37). A late terminal trigger
physically clears `input_payload`, `knowledge_source` and `source_exercise_id` in
all completed, failed and cancelled Knowledge sentence jobs. Deferred source and
publication validators resolve the immutable retained link after that clearing.
The source tag remains metadata. Temporary revocation makes history unavailable;
link deletion is reserved for permanent note/account cleanup. Note deletion
cascades it; the due-account purger explicitly deletes actor-owned links even on
another user's note. Independent material owned by another actor survives.

The migration's retained-row backfill is a **predeployment migration for this
unreleased feature**, not a recovery procedure for previously untrusted deployed
worker data. It checks source/actor/note/input structure and refuses inconsistent
rows before retaining them. It intentionally does not require old grants to still
be live: app reads revalidate grants, and a temporary revocation must not erase
otherwise retained private history.

Focused verification:

- Bounded backend TypeScript checks `93434` (production app/source changes) and
  `39977` (including the new regression file) passed using an app-local ephemeral
  config extending the real backend config. The temporary config was removed.
- Scoped source/test lint `17377` passed.
- On the separately created disposable loopback database
  `languon_auth_sentence_retention_test`, port 55559, with explicit disposable-test
  opt-in:
  `pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-sentence-private-retention.database.test.ts`
  passed **3/3**, no skips (`76628`, 9.99s), through migration 146. It proves:

    1. physical parent-body clearing for completed/failed/cancelled actions while
       the app retains authorized history; another actor and a revoked source
       cannot read it;
    2. permanent source-note deletion removes its link and private parent body,
       while an independently copied note keeps its own job and link;
    3. actual due-account purge removes the learner's private source on a foreign
       note while preserving the author's note and another actor's independent
       copied material/job.

- This retention suite supplies deterministic prepared output directly at the
  production worker completion boundary; it makes no provider request. The
  independent actual-SDK generation/check and deployed-role proof are E37's
  five-case run `59790`, which passed through migration 146 before this suite.

The initial retention run `80083` passed the two cleanup cases but its first
fixture tried another `new-only` round after the sole vocabulary entry had
successfully been exposed; the application correctly reported exhaustion. The
fixture now performs failed/cancelled actions before the successful round. No
product behavior or assertion was weakened.

Exact fingerprints at the final run:

- Migration145: `39910be9783589b9ea0084a8675cc3a2015520261936c063daa30f3c5a676237`.
- Migration146: `34d9ea941ad4920206e6658abe30548d2740497637413bd4df59486dc24871d2`.
- Three-case regression: `7bba8effef0ffde5bf0e059c2a069e6c0bddccc5a3cf0aa2e3a02b718f62231f`.

The serial DB/SDK slot was released to the existing dictionary-worker role
compatibility check before consolidated final gates. These focused results do
not constitute final feature evidence approval.

E34/REV-08 addendum: the actual private bilingual child is now keyed by target
language and overlay timestamp. The real-widget/query-hook regression
`pnpm --filter @languon/web exec vitest run tests/knowledge-private-translation-target-switch.test.tsx`
passed 1/1 (`79274`): French bilingual content, then an outer switch to German,
then German bilingual content, with no stale French text and no generation call.
The independent completion reviewer closed REV-08 on source and focused proof.

## E37 — private Sentence worker authority and compatibility (2026-10-29)

SEC-6 remediation replaces unrestricted Knowledge job/history reads with an
explicit security-barrier metadata projection. Private bodies, grants, operation
and session identity are redacted from that projection; terminal Knowledge jobs
are excluded. The base table grants only identity/state/dictionary-result reads
needed by established update predicates. Private history and retained source
links have no worker table grants.

Claiming a private job atomically checks its live source/action and creates an
unpredictable capability; only its digest is stored in an ungranted table. Fenced
reads establish a protected backend/transaction/job/worker/fence context after
verifying that capability. Publication and provider dispatch require that context.
An invoker trigger prevents retagging or mutation of admitted private content and
rejects raw financial fact changes even with a valid capability or recovery
context. Compatibility accounting is derived from settled canonical attempts.
No capability is forwarded in provider-port metadata; private-query errors discard
SQL parameters and their original cause before propagation.

The final independent source/security remediation reviews found no remaining
SEC-6 exploit. Their bounded closure remains subject to the final combined gates.

Verification, serialized on the task-owned disposable PostgreSQL infrastructure:

- `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_sentence_paid_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_sentence_paid_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-sentence-paid.database.test.ts` passed **5/5**, no skips, run59790,64.74s through0146. Both generation policies exercised the real Sentence SDK/provider with only external HTTP replaced. Other scenarios proved revoked access, due source-owner purge with an independent copy, and actual restricted-role generation/check/publication/settlement. This SDK run used test hash `d4970d451edc415ecbebb8ac86854f416c11440215113a38de1f90a21846e35e`.
- After adding three explicit retained-link INSERT/UPDATE/DELETE denial assertions, the same command with `-t 'publishes private exercises under the deployment worker role'` passed the selected case **1/1**, run72284,5.55s; four unrelated cases were excluded by the filter. This final case proves raw private SELECT/INSERT/UPDATE denial; view redaction; guessed/cross-worker/cross-fence/cross-job capability rejection; exact admitted provenance; nested malformed content/feedback rejection in an authorized transaction; provisional output rollback without settled finances; same-transaction raw financial mutation denial; valid Unicode feedback spans; physical terminal redaction and hidden terminal view rows; replay rejection; and expired lease recovery without caller-supplied settlement facts.
- The same disposable database command selecting `tests/integration/modules/learning/infrastructure/sentence-worker-role.test.ts` passed **1/1**, run95878,5.69s. Established dictionary generation, checking, preparation-parent settlement and least privilege behavior remain usable. The old fixture now seeds its explicit configuration before the shared accounting/routing helper; one remaining dictionary preparation read uses the safe projection instead of widening base privileges.
- `pnpm --filter @languon/backend exec vitest run tests/unit/modules/learning/sentence-domain.test.ts tests/unit/modules/learning/application/sentence-worker-service.test.ts tests/unit/modules/learning/infrastructure/private-sentence-query.test.ts` passed **48/48**, run68581,1.20s. The extra privacy regressions cover credential omission from provider-port metadata and sanitized Error/object driver failures.
- Scoped ESLint passed56724 across the changed worker, preparation compatibility, test and privacy regression files. Bounded worker source TypeScript passed56271; the temporary config was removed. Final consolidated static checks remain required.
- E42 records the independent retained-source owner’s **3/3** PostgreSQL proof76628, including completed/failed/cancelled redaction, authorized historical reads, revocation, note/account cleanup and independent-copy survival.

Final focused-proof SHA256 values:

- Private worker migration0143: `63eefd42cfa73d1e67ec349e3bca59fe81518a9f5077040507a27d6375c2b263`.
- Retention migration0146: `34d9ea941ad4920206e6658abe30548d2740497637413bd4df59486dc24871d2`.
- Final private lifecycle test (run72284): `a854eb57e3804b5f5e304bc7ab81433957205043e6969bde9282ddda19d04f74`.
- Legacy worker compatibility test: `e5d46b299a8c41c9a008fce150aaef28f723df1e8228e64a1d0185b8f5f7a52b`.
- Worker projection/typed query seam: `bbe73ad92f5b549211755afa67afba918059deafdd75f9d7d074e820ba8327e8`.
- Deployment worker grants: `1830ad759d617a4e71d27d4a8e5caa5711c1d33f8f6df5a3612184a2f9a0bce3`.

Operational residual: shutdown cannot reconstruct a private capability from a
public worker ID. Such work remains fenced until its configured bounded lease
expires, then the existing recovery path conservatively settles it. The final
restricted-role case proves this behavior. No paid/live provider action was run.

## E41 — final branch/provenance authority and paragraph-copy regressions

After source freeze/formatting, root ran:
`ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://critical:critical_test_only@127.0.0.1:55559/languon_auth_feature_review_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_feature_review_test pnpm --filter @languon/backend exec vitest run src/modules/knowledge/infrastructure/persistence/drizzle/library-copy.database.test.ts tests/integration/modules/conversations/conversation-store.test.ts`.
Run75975 passed52/52, no skips,59.88s through migration0146. This target was
confirmed absent and separately created for root; no shared/developer DB reset.

Actual deployed restricted role denies branch bodies/wildcards, proposal table
reads, narration provenance reads/inserts and a wrong lease supplied with an
otherwise valid proposal. The same role creates a typed proposal successfully;
authenticated owner Apply changes only its exact working target, then Save
remains separate. All45 existing conversation cases and7 atomic library cases
pass, including two-passage create/append text with original/translated paragraph
boundaries, contiguous offsets and independent identities. Earlier46579 selected
2/2 is historical; its empty-array wrong-lease negative was strengthened before
this complete run. Proposal driver failures are sanitized before exposing model/
application errors, preserving no raw block/lease parameters.

SHA256: worker role: `1830ad759d617a4e71d27d4a8e5caa5711c1d33f8f6df5a3612184a2f9a0bce3`;
migration0142: `330c29526502414a5b61bcfbeb171e52cf413e983199b96d7290457b21145edc`;
conversation test: `44c3728f093bb31619194d169db323b93934cd058fbe986f37330fff5ebb719c`;
library DB test: `f2f48e82412abb0cf1aa45d437a911cee2458ef59aad3c89b1cc088304f90460`.

## E43 — final consolidated checks, in progress

Changed-file Prettier write completed successfully over592 tracked/untracked
feature worktree files with repository ignores. `git diff --check` passed.
Full `ALLOW_DISPOSABLE_DATABASE_TESTS=false ALLOW_DISPOSABLE_REDIS_TESTS=false
pnpm check` passed setup documentation validation, then stopped at the global
format check:302 files have baseline formatting differences. Root compared every
warned path with the complete feature diff from main5735593 plus untracked files:
**zero warnings are feature files; all302 paths are unchanged from main**. Example
audit-page.tsx main/worktree SHA256 both360894bd383df656bce12bef360f670ea0080ac8aa740198dcd68c3bb1c6710c.
No unrelated file or ignore rule was changed to force a green aggregate. The
aggregate command is failed, not passed; remaining mandatory checks run separately
and affected-format evidence will be retained. This baseline style failure does
not replace or waive any runtime/security/static/critical gate.

`pnpm agent-skills:check` passed10 tests and validated27 repository skills.
Additional style/dev-panel/guide/lint/type/test/build/critical/browser/diagram
results remain pending below.

## E44 — editor hierarchy remediation (2026-10-29, verified)

User supplied desktop screenshot shows unsupported prerequisite prose above the
note title, authoring controls overlapping the empty placeholder and oversized
copy/library buttons. Scope remains F059 presentation remediation.

- Note title/metadata/prose now precede authoring controls. Compact shared Menu
  offers six labeled/icon block types; Add block is no longer a kind selector
  plus a separate submit button. Audio opens a named upload dialog.
- Library insertion is a small secondary action; copy is absent on empty notes.
  Existing block management is collapsed, retaining explicit edit/duplicate/
  delete/move and preview. Relevant narration/transcription lives after the
  editor in collapsed Audio tools; blank documents display no prerequisites.
- Uses shared Menu/Button/Dialog, runtime CSS Modules/tokens, four locales.
  No new dependencies, provider selections, content insertion or save semantics.
- Independent source review UI-REV10 found native file input retaining a rejected
  file, preventing identical-file retry. Capture File then clear value before
  validation/await; rejected-first/same-file-second regression passes.
- Browser uncovered existing private translation nested-label ambiguity: explicit
  useId/htmlFor now labels select without option text. Existing 5 widget tests
  plus editor/library/copy tests total26/26 passing, no skipped tests, command
  log `/tmp/languon-059-editor-redesign-unit-2.log` (5.24s).
- Web typecheck, affected ESLint, styling contract, guide mapping and all33
  guide schema/mapping checks passed. Final follow-up checks logged separately
  under `/tmp/languon-059-editor-redesign-*-final.log`.
- First/second real browser runs independently established manual block authoring,
  explicit Apply/Save/reopen, keyboard Escape/focus return, upload and private
  practice. Their later integration failures are retained, not reported green:
  owner library save must use practice route and page-level sibling action;
  asynchronous budget consent must be awaited; Sentence capability composition
  was missing from fixture (now mounts production composition).
- Rendered blank desktop1440x1000 and mobile390x844 plus open menu inspected:
  no overlapping placeholder, large disabled copy bar or raw setup instructions;
  buttons wrap without cutting the document. Reference is diagnosis input, not
  a pixel-fidelity design. Populated editing/practice and eligible media tools
  final browser verification is recorded below. No full-feature completion claim.

E44 final remediation and verification:

- Private-learning readiness: real browser exposed first Hint before the initial
  learning GET completed (230ms); no event POST occurred. Optional reusable
  `interactionsDisabled` now gates tracked disclosures only for signed-in users
  awaiting matching private state. Anonymous/standalone viewing stays enabled.
  Delayed-state/two-distinct-exercise regression and existing entity/hook tests
  passed30/30, session46721. No revision guessing or implicit attempt creation.
- UI-REV12: parent eligibility originally unmounted paid-operation hooks. Parent
  now always mounts widgets, CSS hides only an idle empty disclosure, and optional
  `hideWhenEmpty` preserves standalone widget behavior. Pending request/quote/job/
  result/error surfaces remain when the last source disappears; new-request
  source controls disappear. Real-hook delayed narration/transcription tests
  prove no abort/implicit apply/confirmation, retained operation/preview, and safe
  missing-source conflict. Three files12/12 passed; independent reviewer source
  and regression closed UI-REV12. No paid HTTP/provider call was made.
- Final registered browser `pnpm test:e2e:critical -- --flow interactive-workbooks`
  session48091, run `c15aa822-b532-496f-99a1-879fd66faaa9`: **2/2 passed, no skips,
  1.3m** on frozen lifecycle/readiness/UI source. Author18.7s, shared47.0s. Includes
  keyboard dismissal/focus return, real author/edit/upload/Save/reopen, library
  saving, private progress/two hints, existing cards/sentence practice, private
  translation with explicit budget consent, sharing/copy/revocation, safe media
  replay and runtime console/request assertions. Log
  `/tmp/languon-059-editor-redesign-browser-complete.log`.
- Final web typecheck81963, styling31690, affected UI/widget ESLint64539 and prior
  editor/readiness lint27605/34349 all passed. Final docs validator8544 passed
 16 tests/33 guides; current mapping `sha256:9b82f864dfa04019` passes.
  `git diff --check` passed and runner restored generated `next-env.d.ts`.
- Final screenshot files and checksum manifest:
  `evidence/editor-redesign/{editor-empty-desktop,editor-empty-mobile,editor-block-menu,editor-populated-desktop}.png`
  and `manifest.json`. Root inspected desktop1440x1000/mobile390x844 final images;
  independent reviewer inspected the bounded design states.
- This closes the requested editor UI remediation. F059 remains In progress;
  unapproved transcription-provider selection and outstanding feature-wide
  build/full-critical/final-delivery gates are not waived by E44.

## E45 — owner-chat pre-dispatch failure (2026-10-29, final gate running)

Reported symptom: owner submits vocabulary-generation request in Knowledge;
turn admission succeeds, turns fail in under a second with generation_failed,
no output/tool calls/model usage, followed by misleading conversation-loading
notice and proposal-list polling. No actual learner identifiers/prompts retained
in this evidence.

Diagnosis and causal proof:

- Read-only local metadata for reported turns confirms provider_dispatched=false.
  Existing approved OpenRouter model exists and its credential is configured.
  All network/native dispatch was denied in a local factory-only diagnostic.
- Actual strict provider resolver rejects inconsistent execution snapshot: final
  admitted budget uses reduced maxCost32831/reviewed rates125000/500000 versus
  original aggregate400000/catalog rates1000000/3000000. Admission adjusts
  execution.budget for reviewed prices/operator/context but failed to mirror the
  final allowance in snapshot.aggregateBudget; worker validation correctly fails
  closed before HTTP. No key/model/provider change or relaxed validation needed.
- Three block-proposals GETs are initial+active2s read polling, not duplicate
  generation. Frontend detail JSON/empty selection are valid; refresh-failure
  hypothesis is not supported (query invalidation does not throw by default).
- Actual generic copy cause: failed TutorMessage passes generation_failed to
  ConversationErrorNotice; unhandled code fell through to load/update error.

Changes:

- Conversation admission returns a cloned final budget as aggregateBudget in
  its pinned snapshot, after every price/operator/context clamp. Same allowance
  already reserved/held/capacity-checked is dispatched; route, model, per-call
  bounds, pricing authority and source fences stay pinned. Failed old turns are
  not rewritten or replayed and no real user data was modified.
- Explicit generation_failed notice in all4 locales preserves message/retry
  guidance and does not invent a no-charge claim. Admission hook/polling remain
  unchanged; real ConversationMessages regression exercises terminal code path.

Retained regressions and focused evidence:

- New conversation-production-execution.test.ts uses real Knowledge/source
  authorization, store.submit/conversationAdmission, actual production worker,
  default OpenRouter factory and pinned Mastra SDK. Only external HTTP replaced;
  unexpected network rejected. Free operator/no customer conversation tariff and
  Paid × success/rejected provider are all covered. Red41959:4/4 failed with no
  provider HTTP; green34779:4/4 after fix. Final reviewed-price fixture0.125/0.5
  run18698:4/4 passed/no skips22.81s.
- Assertions prove exact admitted budget/snapshot identity and reduced spending
  limit, typed vocabulary proposal+assistant response persisted, unchanged saved
  content, immutable admission through execution, Paid positive charge, Free zero
  hold/charge, technical failure zero charge, measured positive provider expense
  vs unknown failed expense. Separate owned disposable PostgreSQL
  languon_auth_chat_execution_regression_test on55559; existing local data untouched.
- Final test SHA256 b92c042583e19391809f0691d3b478c12d73cef417fe498748f76adae6fe98b1;
  accounting source daf886cc511aa651a92f9ad7c7740aa64c47ec843be20cd50efbfe0be7540254.
  Focused test lint9162 and runtime lint23777 pass.
- UI red75195:5 new assertions fail; green56650:15/15 notice/budget-confirmation
  tests pass; scoped lint58867 and formatting pass. Web type81215 passes.
- Independent functional source approval c479b6dc05f71e0625751aff1d310c439a409709d97daa0250a95b525fed7c0c
  closes INC-REV13 exact budget/positive Paid charge evidence gap. Independent
  security/financial review approves no allowance expansion/new policy. External
  HTTP remains fake; no paid/live provider call authorized or performed.

Final coverage in progress: backend type99035; full14-flow critical23099 (run
997f46f5-06e8-4a11-a57c-e5c03a767a07), registered production suite4 exact scenarios/
minimum462, and mapped browser generation notice/retry assertion. Guide revision
75e5b518eae5d4e0 mapping passes. Final result must replace this pending checkpoint;
source approval does not waive execution gates. Original F059 stays In progress.

E45 final-gate checkpoint:

- Backend type1478 passes on final production-test assertions (earlier99035 also
  passed; final rerun removes source-read timing uncertainty). Web type81215,
  docs82844 (16 validator tests/33 guides), affected formatting and UI/runtime
  lint pass. Local backend uses existing `tsx watch src/index.ts` and restarted
  after the admission source change; no env update/manual restart required.
- Initial full critical23099/run997f46f5-06e8-4a11-a57c-e5c03a767a07 passed
  setup-to-generation1, then stopped at an unrelated newly-added admin test:
  exact menu name omitted Ant Design icon prefix. Subsequent run82202/8e8300a3
  failed next stale required-field accessible name. Run33892/af58093c failed the
  shared helper selecting a non-active virtual option, while the visible option
  was present. These failures remain retained; none is reported passed.
- Test-only admin selector repairs target the unique role/anchored label suffix
  and select the non-searchable duration option via actual keyboard controls;
  required native JSON, hidden numeric fields, no-publication/no-provider-call
  assertions remain intact. No production admin or pricing policy changes.
  Independent reviewer approved anchored selectors; final keyboard/browser proof
  remains required. Registry sorts selections, so listing admin last did not
  defer it. Core run21585/59e374f4-e0b0-4c7e-b3eb-c073bf4d6cac explicitly excludes
  that flow and automatically retains setup dependency; admin flow will run
  separately after remaining core coverage, without hiding its prior failures.
- No user prompts were logged, user turns replayed or local material modified;
  temporary read-only factory probes removed after retained synthetic regression
  was established. No live paid provider request was performed.

E45 current-local-configuration verification: read-only diagnostic57523 applied
only the fixed in-memory budget projection to the historical failed execution
and called the real factory with current route/price/credential fingerprints.
Result factoryAccepted=true for existing OpenRouter/openai/gpt-6-luna, HTTP
attempts0, database read-only. No historical execution was updated, no provider
request was dispatched. This rejects a second credential/route readiness failure
after the repaired budget invariant. Temporary probe removed. It is factory
readiness proof, not a paid/live model completion claim.

E45 secondary Texts regression and final frozen rerun:

- The first complete execution-stage report (59e374f4…) had748 tests,745 passed,
 3 failed/no pending. Two were a real F059 regression: find() passed the entire
  job to source authorization, so owner status/cancel incorrectly checked mutable
  Text version. It now projects immutable owner/folder/job/source identity only;
  Knowledge-backed jobs still repeat live source/actor authorization. Full Text
  version checks remain at admission, claim, dispatch and publication. Focused
  stale2 tests red→green25763, no assertion relaxation.
- Third failure was a stale pre-existing retry fixture: unchanged SQL excludes
  previously failed routes, but the fixture authorized no fallback while expecting
  same-route retry. The fixture now explicitly authorizes a compatible existing
  fallback, with synthetic probe/price/readiness and distinct-route receipts;
  two attempts/one hold/130milli assertions retained. No runtime retry/SQL change.
- Full current Texts suite88855 passed17/17/no skips103.44s including actual SDK
  ordinary/private/restricted-role, stale read/cancel, claim-time version rejection
  and retry/retention. Scoped lint21708 passes. Final backend type64868 passes on
  frozen updated source; affected expanded formatting also passes.
- Texts source SHA2566f70df3ee53192cff245bd1204d8c6a3df44739b4c2b5112ab530db141a7d6c5;
  test4e1b19808a1300d3d3a299613144e3411d081ef056a2f71151d7bfa997333988.
  Independent functional and authorization/security reviews approve this repair
  and confirm owner/folder/source fences survive; no material finding remains.
- Final12-file incident source manifest:
  evidence/chat-generation-failure/incident-source-manifest.json, aggregate
  62fb5c4ff8dd24ae752c29ce53c8a44e6e0130ca25614c8c83b5892e706efb58.
  Independent reviewer verified every current file hash against main5735593… on
  feature/interactive-workbooks. This is incident scope, not full-feature approval.
- Final critical93135/run3962ac15-b74e-4349-aa89-b74eb49595db selects
  admin-text-ai-routing + ai-execution-contracts + speech-playback + admin-mcp.
  Admin2/2 passed56s on final keyboard/native JSON selectors; complete67-suite
  execution stage currently running on frozen source with no failures so far.
  Earlier core browser passes are retained for the other10 registered flows;
  full14-flow evidence is the explicit union, not a claim failed runs passed.
  The revised conversation four required test titles match actual report titles
  exactly, including Vitest interpolation quotes. Final stage/suffix and final
  evidence approval remain pending.

E45 critical-registry finding INC-REV14:

- Run3962ac15… completed67/67 files and748/748 tests, no skips, in895.27s.
  Its command nevertheless exited1: registry still required the pre-parameterized
  private sentence-generation title. The unchanged report contains both actual
  v1/v2 titles. The failed command is retained as failed.
- Registry now requires BOTH exact versioned titles. A new regression removes
  each independently while aggregate counts remain passing, and proves rejection.
  Registry tests16/16 pass after formatting; current assertPassingBackendReport
  accepts all748 tests in the preserved3962 report. No matcher or policy weakened.
  Independent reviewer closes INC-REV14 on source and validator evidence.
- Final13-file source manifest supersedes earlier aggregates:
  ed5b544c74a94061518662e92be08b2a663696b57b6d345e1955315b559acd4b.
  Additional file is scripts/critical-flows/registry.test.mjs.
- Remaining suffix command47537/run0549232b-dae1-4e00-b251-4ba8ce65b6fb
  selects speech-playback/admin-mcp and automatically reruns its complete
  ai-execution-contracts dependency. All runtime source is frozen. Final suffix
  evidence and incident completion approval remain pending.

E45 terminal verification — 2026-10-29:

- Final suffix47537/run0549232b-dae1-4e00-b251-4ba8ce65b6fb exited0:
  ai-execution-contracts67 files/748 tests accepted by the strict current gate,
  speech-playback4/4, admin-mcp3/3; no skips, retries or incomplete scenarios.
- evidence/chat-generation-failure/critical-union.json records all14 registered
  flows/774 tests and SHA256 of each original report. It is a truthful union:
  ten browser flows from59e374f4…, admin routing2 from3962…, and final three
  flows from0549232b…. Every report was revalidated with current exact gates.
  Earlier command failures remain failed and unmodified.
- Final13-file source manifest ed5b544c… remains frozen. next-env.d.ts was
  restored by the runner; final git diff --check passes. Backend/web scoped
  types, affected lint/format, registry16, UI15, production chat4, Texts17 and
  actual browser failure/retry evidence are green as detailed above.
- No new environment variable, provider, model, credentials, paid/live provider
  request or write to the user's existing conversation was used. Existing failed
  messages are retained; retry is explicit. Parent F059 remains In progress;
  this evidence closes only the reported chat incident and required remediation.

## E46 — block controls and tool-continuation correction (in progress)

Base checkpoint ef53108; no live paid calls or existing-user-data writes.

- Backend first reproducer strengthens production vocabulary from one short entry
  to six French/Russian entries with definitions/examples. Two success cases red
  before second HTTP; controlled-failure cases pass. Initial reserve-to-route-cap
  repair yields34/34 scoped tests,4files86.92s; backendtype92198pass and affected
  lint/format pass. Financial/source review confirms server-derived capability,
  immutable limits and prospectivehold. Further affordability correction pending
  under E46-REV2: preserve working smaller budgets instead of unconditional cap.
- Root selection test reproduces baseline:2fail/1pass for whole-block selection;
  TextSelection-only repair plus existing initialization yields11/11 green.
- UI replaces management panel with shared inline heading actions and native
  drag handle, optional typed per-block menu extensions, and existing Edit dialog.
  Canonical comparison prevents selecting identical content marking it dirty.
  E46-REV1 resolved: media/source exercise Copy opens authorized destination
  preview, Duplicate retains same-note destination. Modifier-copy block drops
  are consumed unchanged; ordinary moves/text drops remain permitted.
  Frozen15-file UI manifest94bd01cbd82d47750c0d172e1bfa105c43d65c468600e0f9f3ebeb87e788a305
  at /tmp/languon-059-block-controls-manifest.json; reviewer verified source.
- Focused native-browser check77930/run964a8907-e1b9-4fcc-b5f4-5f9bffc69fd1:
  sharing1pass; author1fail before any AI dispatch. POST400 credits_exhausted
  reflects NEW paid-AI scenario missing its synthetic per-action prerequisite:
  legacy fixture default20credits cannot cover even baseline33192byte minimum
  at1000credits/M input. Existing manual-only journey never needed an AI budget.
  Explicit synthetic owner preference100 via existing API prepares that new step;
  wallet grant and productiondefaults unchanged. This does not close REV2: a
  separate production case must prove a budget sufficient for initial+continuation
  but below fullroute ceiling. Failed run retained, no passingbrowserclaim.
- An initial pnpm test invocation forwarded filters behind an extra separator and
  accidentally expanded to allwebtests during activeworker edits; abortedCtrlC130,
  not counted. Serial explicit `pnpm --filter @languon/web exec vitest run ...`
  used thereafter. Earlier parallel5second timeouts retained; no timeout increase
  or assertion weakening. Final source/evidence approvals pending actual gates.

E46 stabilized preflight:

- Final UI5files/36tests22391pass/no skips80.19s; webtype87032EXIT0.
  Current root styles/fixture/browser test ESLint and formatting pass. Guide
  revision297bf2776ed431ad/check and all33guidechecks/16validators pass.
- REV2 refinement red: old unconditional-cap Paid cases2fail/Operator2pass;
  final affordability run40621EXIT0,4files35tests27.91s. Paid60credits supports
  exactly55000 prospectiveinput units and six-entry two-call completion while
  full64000 would be unaffordable. Operator64000 retains existing ceiling.
  Reduced quotes3000output,1tokenfloor,0outputrejection and nohold before explicit
  confirmation checked for continuation flag bothfalse/true. Finalbackendtype
  93662EXIT0; scopedlint/stylepass. No wallet, tariff or productiondefault change.
- Initial input/output allowance is preserved; monotone search expands prospective
  input only within route/aggregate/reviewedoperatorcost/customeraction/wallet
  bounds. Final cost/quote/hold/snapshot follow. No runtime guard relaxation.
- Completion reviewer closes REV1+REV2 on source/focused evidence; independent
  financial/security review approves refined accounting hash7e4d44928d98d948da6e3e1e4bc5368351cf4ded0b1ace6dd72b06773ee00e0d.
  Residual: successive calls share actionbudget; a percallcap is not a guarantee
  all five calls can consume it. Existing failclosed dispatch remains intended.
- Frozen27file source manifest aggregate
  e8c716997a9bdac856a7e4a8fb21ddf77b991215b98abf804e44f0702f9eaece
  at evidence/block-controls-and-continuation/source-manifest.json. Root full14flow
  critical88393 now running /tmp/languon-059-e46-critical-final.log; new exact
  accounting case mandatory, minimum463/expectedactual749. Final native drag,
  proposal framing/Apply screenshots and final evidence approval still pending.

E46 native-browser correction checkpoint:

- Full88393/run3a5b0f2b-c36f-4b3b-937f-b20fa3315865 retained failed. Seven
  precedingflows pass. Workbooksharing passes; author generation and followup
  succeeded, then test hits strict locator ambiguity: actual answer plus legacy
  WorkspaceSuggestionCard repeat same acknowledgement. No duplicate AI turn.
- This exposed undesirable scoped UI: successful typed-block acknowledgements
  were offered again as plain-text edits. TutorMessage now suppresses only that
  prose WorkspaceProposal when canonical persisted propose_learning_blocks is
  succeeded. Failure/no-tool behavior retained. New3-state regression red1/3,
  green3files26tests6.01s (includes existing error/prose-review suites); final
  webtype85827EXIT0, lintpass. Reviewer sourceapproves narrowdelta.
- Browser asserts primary data-assistant-content and no prose Use-in-document
  for typedsuccess. Guide7714455deb2c9ee8/check matches. Source manifest refreshed
  to29files. Prior7 browserpasses remain valid: scopedtyped Knowledge-only UI
  condition is not exercised by their authentication/admin/dictionary/sentence/
  Text journeys; backend5files unchanged. Remaining7 criticalflows rerun on final
  source, including workbook/assistant and full67/749 execution stage.

E46 native drag, lifecycle and final frozen gate:

- Browser5fe3d3ca… retained failed: generation/followup/framing/Apply/settings
  work; DnD fails first-order assertion. Controlled external content replacement
  also emits React flushSync warning. New recovered-content assertion reproduces
  lifecycle warning red; queued cancellable microtask repair keeps emitUpdate:false,
  checks destroyed/superseded editor, and passes22 full scoped tests/no skips.
- REV3 native diagnostics retained2b920dee…, bc5f166f…, f4f46b1b…. Native
  grip must itself be explicitly draggable and decorative SVG must not receive
  pointer hits. Metadata-only probe establishes correct PM move/slice afterward.
  Playwright dragTo then retargets a distant block when it scrolls before initial
  held movement. Maintained test now initiates native drag before scrolling,
  moves through real dragover events and asserts intended first block, exact
  identity multiset/no duplicates, and exact order after Save/reload.
- 22745/bc5f and81972/f4f46 remain failed, not waived. 11514/run8abbc13a-4ab6-
  4887-9ad8-d56d42f088cf passes2/2/no skips39.7s with causal metadata witness.
  Probe and temporary Editor import subsequently removed; no runtime/debug
  instrumentation remains. Modifier-copy guard unchanged. Reviewer closes
  REV3 on source/behavior, pending clean terminal final gate.
- Visual inspection additionally found workspace prose h3 margins leaking into
  typed-block headings. Scoped :not(:where([data-learning-block-id] *)) keeps
  prose typography outside custom blocks. Current desktop/mobile headers align
  title/grip/ellipsis; existing Menu handles focus, dismissal and viewport anchoring.
- Final source30files manifest9459f983819421d9066f3205f8c83fa896ca63d19e304700d25b709c96fcba6c.
  Full affectedweb8files62tests22296passed13.64s/no skips; finalwebtype37121,
  globalstyles, scopedlint/format/diff pass. Full33guide/16validator54772pass.
  Backend35/type93662 and financial review remain valid, code unchanged.
- Clean final7flow85481/run0d838129-7006-4845-a8b7-c406837ddaa8 passes
  interactive-workbooks2, chat-lifecycle1, insufficient-credits1, free-interview1.
  Complete67-suite/expected749 execution stage running; speech/adminMCP follow.
  Four screenshot artifacts and hashed browser-evidence.json copied under
  evidence/block-controls-and-continuation/. Runtime assertions prove no page/
  console errors or unexpected5xx. Root inspected aligned desktop/mobile menus
  and clean typed proposal preview. Final evidence approval still pending.
- Independent source review has no open material finding. E46 approvals are
  bounded to these requested fixes; parent F059 remains In progress.

E46 broad execution interruption and independent diagnosis:

- Clean0d838129 browser reports remain passed (4flows/5tests), but broad backend
  stdout reports two failures: unchanged sentence fallback(false)37069ms and
  unchanged dictionary pinned-revision15057ms. Root stopped the already-failed
  stage to bound diagnosis;85481 terminalEXIT1, summary records pnpm exitednull.
  No ai-execution-contracts.json was written. No749/fullgatepass claimed.
- Required independent tester e46_execution_gate_diagnosis reproduced the exact
  cases only on separately confirmed55559/languon_auth_chat_execution_regression_test,
  never activecritical55489 or userDB. Original test/hook limits and assertions
  preserved. Each passes individually; serial combined original controls
  --no-file-parallelism --hookTimeout=30000 --retry=0 passes2/2 with48 intentional
  name-filter skips,10.72s total/7.19s tests. This is focused diagnosis, not a
  substitute for the no-skip critical gate. Commands/results retained in agent
  transcript (inline exit0, no disk logs/sessionIDs were generated).
- Both test sources are byte-identical to checkpointef53108: sentence SHA256
  f0899c93aca96d21de0b2020e82d608cfd66ad8a55da69b3bb25fcfa4c8ecdae;
  dictionary e09c0dd4db18a198b7dc715bcc8202a0ed12ed537dfbf6f926bc60b8f4b48011.
  No source or timeout/assertion change made. Evidence supports a transient
  broad-run setup/timing condition, but missing interrupted error stacks mean
  the exact phase cannot be proven. Fresh complete gate remains required.
- Root resumed only required remaining3 flows in49429:
  /tmp/languon-059-e46-execution-final.log (AI67/749 +speech4 +adminMCP3).
  No competing builds, SDK tests or DB clients remain. Final30files9459… unchanged.
  If repeated, retain terminal JSON before remediation. No final approval yet.

E46 terminal diagnosis and bounded harness repair:

- c58610bf-d261-4274-83a9-42952ff83467 completed67files749tests747pass2fail,
  no pending,910.67s, EXIT1. Complete JSON retained. Stdout identifies first
  failure as Vitest Test timed out in5000ms in the restricted-role SDK/private
  translation case; the next fixture gets PostgreSQL deadlock. This is one
  harness timeout/abandoned-work chain. No stale test process or blocked DB
  writer was found; pg_stat_activity showed live progress without blockers.
- Completion reviewer and independent tester approved a case-local30000ms
  watchdog for this one parameterized functional real-DB security journey.
  Only comment+it.each timeout argument changed. The worker10000ms deadline,
  all security/financial/result assertions, global defaults, retries and all
  other testcase budgets are untouched. No asserted5s product SLO existed here.
- Root full17file run55681 on confirmed disposable55559 passed17/17/no skips
  101.82s (96.83s tests). JSON/log retained at
  /tmp/languon-059-e46-texts-harness-final.{json,log}. Scopedlint45043,
  formatting and diff checks pass. Independent reviewer inspected exact patch
  and fullfile result, approved narrow harness remediation. This supersedes
  guesses about worker10s expiry; actual cause is the framework5s body limit.
- Frozen source31files aggregate
  9712b62705363f0b10f696e30dbe5a794f9f55740c2e64a7afc32bfab6dae42d.
  Earlier valid browser reports reuse unchanged runtime; later delta is only
  a test-local watchdog. Browser metadata records tested/current manifests.
- Final remaining3flow86764/run75c427d8-2c41-477a-8dee-6145ba6dde21 now runs
  unchanged strict67/749 execution selection, speech4 and adminMCP3:
  /tmp/languon-059-e46-execution-verified.log. No competing SDK/build/DB clients.
  Do not mark complete until actual terminal gate/evidence approval. ParentF059open.

E46 frontend composition preflight: KnowledgeEditor remains273 lines after its
controlled-content timing repair. It owns one TipTap instance, canonical accepted
value, proposal-target transaction mapping and the workspace/full rendering branch.
The imperative handle, forms, menus and reusable block rendering are already
extracted. Splitting the remaining lifecycle would pass coupled editor/ref/target
state between hooks without separating a responsibility, increasing stale-update
risk in this correction; no unrelated refactor was introduced. Other changed
components remain below250 lines. No shared UI primitive or production dependency
was added; existing Menu/Popover/token contracts are reused.

### E46 terminal verification — 2026-10-29

86764/run75c427d8-2c41-477a-8dee-6145ba6dde21 exited0: strict execution gate
67/67 files,749/749 tests; speech4/4; adminMCP3/3. No skips, retries, expected
failures or incomplete results. The corrected security integration harness
completed normally; worker/runtime deadlines and assertions remain unchanged.

`evidence/block-controls-and-continuation/critical-union.json` validates all14
registered flows/775tests using current strict report validators and stores each
original report SHA256. It truthfully reuses seven unaffected browser flows from
3a5b0f2b, four final-runtime browser flows from0d838129, and the three terminal
flows from75c427d8. Failed and interrupted commands remain failed/unmodified;
no raw report was merged or rewritten. Later deltas were Knowledge-only rendering
and one test-local watchdog, with reuse boundaries explicitly recorded.

Final31-file manifest9712b62705363f0b10f696e30dbe5a794f9f55740c2e64a7afc32bfab6dae42d
matches every current source/test/guide/registry byte. Finalweb62, backend35,
Texts17, type/lint/style/format/doc checks and actual desktop/mobile/native drag
proof are current as detailed above. Tracked next-env.d.ts restored, finaldiff
check passes. Temporary drag instrumentation and the owned Chrome backup removed.
No user source data, model/provider/env configuration or paid/live provider calls
were changed/performed. External live-model behavior is not established by the
fake transports; production composition, limits, persistence and settlement are.

Independent reviewer revalidated the14/775 union and all31 source hashes, found
no open material finding, and is completing bounded E46 evidence sign-off.
Parent Feature059 remains In progress; this is not whole-feature approval.

E46 final independent verdict: APPROVED. Reviewer revalidated manifest9712b627…,
all14/775 original report hashes, final terminal gate and durable records. No open
material scoped finding; REV1/2/3 and the test-harness repair are closed. E46 is
Complete. Parent Feature059 remains In progress; no whole-feature completion,
merge or additional commit is claimed.
