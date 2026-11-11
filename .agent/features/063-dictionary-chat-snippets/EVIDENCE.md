# Evidence: Dictionary chat snippets

Status: Selected local gates passed; final independent completion and security evidence approved2026-11-11
Date: 2026-11-11

## Scope and tested state

Prerequisite baseline11a07a5c; feature branch preserves the prior unmerged stack. Source hashes, report hashes and exact file selections are in [evidence/verification.json](evidence/verification.json). No developer secrets or raw learner prompts are included. Reports in /private/tmp and ignored test-results are local raw evidence, not portable committed fixtures.

## Acceptance and results

| Acceptance   | Final evidence                                                                                                   | Result                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| AC1–2,9–10   | Actual source/admission/default worker/Mastra/provider SDK, replacing only external HTTP                         | 5/5,28.08s                                              |
| AC1,4–8,10   | Real PostgreSQL17 store, fenced role, atomic dictionary writes and global permit saturation                      | 5/5,6.70s                                               |
| AC1–2,4,9–10 | Exact six backend domain/HTTP/tools/history/context/runner files in manifest                                     | 56/56,7.10s                                             |
| AC3–8,11     | Web read-only preview, selection, retries, version conflict, duplicate notification and dialogs                  | 10/10                                                   |
| AC3–8,11–12  | Registered real Next/backend/PostgreSQL critical browser journey                                                 | 1 passed,0 skipped                                      |
| AC12         | Backend/web source typechecks; shared contracts/prompts/database builds; scoped lint, formatting and diff checks | Passed                                                  |
| AC12         | Nine backend ESM entry bundles plus migration packaging                                                          | Passed,1.129s runtime build; no declaration-build claim |
| AC12         | Three affected guide mappings and docs:user-flows:check                                                          | Passed;16 validator tests,34 guides                     |

The actual SDK cases prove Free with zero credit/no tariff and omitted count→10; Paid bounded admission, explicit100 and revision from exact original100 then Apply; nested provider401 failure; partial6-of10 failure; exact10 with missing enabled definition failure. Both authoring failures stop after2 calls without persisted snippet, card mutation, outer reply or learner charge. Measured operator expenses are settled. These prove production composition and accounting, not live provider quality/connectivity.

Real PG proves owner/private role/source/lease fences; selected ordering and all modes; current settings after generation; duplicate allowance; exact replay versus changed-payload conflict; capacity rollback; Replace retains old card identities, attempts and progress; and the existing mutation permit fails promptly under saturation with successful retry after release.

Browser run2a85f793-bb98-43e2-92cf-f1bd721ce218 exercises native generation, complete French fields, keyboard subset Prepend, duplicate Append, reload retention, changed settings,390px preview, Replace Cancel/Escape and reconfirmation,6 old active cards archived with fresh new IDs, preserved title/settings and normal editor opening. Strict HTTP/console/page/transport assertions pass. All three screenshots were visually reviewed by the frontend worker. Timing: setup5.602s/execution81.823s/cleanup3.074s; critical total91.465s including build. Artifacts: test-results/critical-flows/<run>/dictionary-chat-snippets-artifacts/.

## Commands and retained reports

- Focused backend: pnpm --filter @languon/backend exec vitest run <six exact files in manifest>; report /private/tmp/languon-snippets-final-focused.log.
- Store: focused dictionary-snippet-store.test.ts on owned PG55573; report /private/tmp/languon-snippets-store-r4-final.json.
- Production composition: focused dictionary-snippet-production-execution.test.ts on owned PG; report /private/tmp/languon-snippets-production-s1-final.json.
- UI: pnpm --filter @languon/web exec vitest run tests/dictionary-chat-snippets.test.tsx.
- Browser: pnpm test:e2e:critical -- --flow dictionary-chat-snippets; report /private/tmp/languon-snippets-browser-complete.log and test-results/critical-flows/2a85f793-bb98-43e2-92cf-f1bd721ce218/summary.json.
- Final source types: pnpm --filter @languon/backend typecheck and pnpm --filter @languon/web typecheck, both exit0; /private/tmp/languon-snippets-handoff-{backend,web}-types.log.
- Runtime: existing nine ESM entrypoints using tsup without --dts, then node scripts/copy-directory.mjs apps/backend/drizzle apps/backend/dist/drizzle; /private/tmp/languon-snippets-runtime-build.log. Public contracts/prompts build separately.
- Guides: pnpm docs:user-flows:check and pnpm user-flow:e2e -- check <dictionary-chat-snippets|dictionary-platform|contextual-language-assistant-and-knowledge>.
- Canonical preexisting card-authoring assembled prompt compared byte-for-byte against11a07a5c: unchanged; extracted normalization/article clauses are shared verbatim.

Registry safety tests: node --test scripts/critical-flows/registry.test.mjs passed24/24 after allowing a temporary loopback listener; sandbox EPERM was environmental, not an implementation failure. Owned disposable PG was removed after verifying exact container ID, task label and tmpfs. Critical runner already cleaned its own infrastructure; developer services remain running.

## Readiness and limits

The first captured doctor was after migration generation and correctly reported two pending migrations; it is not evidence of a ready prefeature baseline. Final reviewed local activation applied only additive0166/0167 to verified localhost:5432/languon_ai_accounting_dev_20261023. No content deletion/insertion or billing mutation. Final conversation doctor passes with optional historical diagnostic INFO; report /private/tmp/languon-snippets-final-doctor.log. Readiness is configuration proof only. No paid/live provider call or production deployment occurred.

Existing feature061/062 production qualification remains outside this feature. Main is unchanged; no release approval or squash of unrelated prerequisites is implied. Backend source types and executable/asset packaging were deliberately selected; no complete standard backend declaration build was run.

## Rework and evidence validity

Initial review's count/paging/conflict/permit findings and security enabled-field failure are fixed and covered by final reports. Prior failed reports remain untouched. Browser setup failures were fixture errors: response .cards versus canonical .data, ESM-only contracts imported through require, and absent disabled learning/sentence capability routes causing404s. Fixed canonical typed responses/dynamic import and real disabled production compositions with startup assertions; no allowlisting or removal of network assertions. Final browser source body remained unchanged through guide metadata synchronization. SDK test assumptions about token envelopes, JSON key order and accounting purpose were corrected to existing actual invariants; production accounting/caps were not weakened.

No full shared pricing/account-erasure/speech/text/sentence aggregates: unchanged adapters/policies have no materially distinct changed path requiring those suites. Required layers are real DB/default SDK/browser, not mocks or compilation alone. Further execution is unnecessary unless source/review changes invalidate this evidence.
