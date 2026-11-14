# Evidence: Named text exercises

## Current verification summary

All selected technical gates pass. Independent backend, frontend and security
completion evidence is approved.
Historical failed runs below are retained with their corrections.

| Gate                        | Final result                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| Real DB/production SDK      | 484 conversation + 79 Knowledge; zero failures/skips; run 3a3da6e1…      |
| Workbook browser            | 5/5; run e8372078…; 1440/390 picker, named lifecycle, private feedback   |
| Admin catalog browser       | 1/1; run 62d10962…; 19 definitions, visible V01                          |
| Studio disposable runtime   | 1/1; 19 primitive discovery, execution, session isolation                |
| Backend build               | Strict full typecheck, ESM, DTS and assets pass; 9 nonempty declarations |
| Web                         | Production build/typecheck/style contract pass                           |
| Focused final fixture tests | 5 files / 176 cases; contracts / 197 cases pass                          |
| Mechanical/traceability     | 153-file lint, changed-file Prettier, diff check, 35 guides pass         |
| Specialist review           | No unresolved material source/security/visual findings                   |

Local configuration readiness remains false only because the ordinary local DB
has two migrations pending. Live paid-provider quality and production deployment
are not claimed. See E-12 for exact retained artifacts and limits.

Updated: 2026-11-14
State: Complete. All selected technical gates and independent completion/security
reviews pass; operational limits are recorded above and in E-12.

## Historical E1a verification scope

## Acceptance coverage

| ID        | Implementation/proof                               | State                                           |
| --------- | -------------------------------------------------- | ----------------------------------------------- |
| AC-1      | Catalog/schema/locales and E-1/E-2                 | Verified for E1a                                |
| AC-2      | Identity, keys, rubrics and frozen provenance; E-1 | Foundation only; active integration E1b pending |
| AC-3–AC-8 | Later milestones                                   | Pending                                         |

## Check records

All checks use Node24, installed pnpm dependencies and local deterministic data.
Base1397126d plus source hashes below identifies this uncommitted checkpoint.

### E-1 — Contract and active-writer regression selection

`pnpm --filter @languon/contracts exec vitest run src/exercise-activity.test.ts src/named-exercises.test.ts src/learning-blocks.test.ts src/knowledge-interactive.test.ts src/workbook-learning.test.ts`

Pass: 5 files, 122 cases, 337ms. Covers all 19 catalog entries, four locales,
immutability, fixed checking policy/format/source prerequisites, key/rubric
constraints, bounded frozen sources, NFC/whitespace identity without changing
case/accents/punctuation/script, and existing Custom blocks. Named fields are
explicitly rejected at the unchanged LearningBlockSchema boundary.
Subsequent ESLint padding repairs changed whitespace only; executable statements,
assertions, schemas, environment and dependency versions are unchanged.

### E-2 — Static checks and public artifacts

- `pnpm --filter @languon/contracts typecheck`: pass.
- `pnpm --filter @languon/contracts build`: pass, ESM103ms and DTS4192ms.
- Built public-export Node import: pass, 19 entries present and exported named schema refuses incomplete input.
- Scoped ESLint over the seven changed/new TypeScript files: pass. Initial run found 13 missing blank lines, repaired by scoped `--fix`.
- `pnpm exec prettier --check` over those files, three docs and four records: pass. Final record edits are checked again before handoff.
- `git diff --check`: pass at source preflight.

### E-3 — Documentation and mapping integrity

- `pnpm docs:user-flows:check`: pass, 16 checker tests and 35 guides/mappings.
- `pnpm user-flow:e2e -- check interactive-workbooks`: pass, one mapped guide.
- `pnpm user-flow:e2e -- check mastra-agent-development-harness`: pass, one mapped guide.

These are mapping checks, not execution of mapped journeys. Existing guide
test-relevant text, scenario markers and source behavior are unchanged.

### E1a historical source identity (SHA-256 at0f430cb9)

Paths are under `packages/contracts/src/`.

| File                         | Hash                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| exercise-activity.ts         | `9f88d09099430c536c2f9ebcd65e8727990a581a8aaa135bc55154615f30c709` |
| exercise-activity-catalog.ts | `538bba4d9a6354e7523da74050b0eceecc705e36cbd7ff2f93ad3e0dc9aedf33` |
| exercise-activity-locales.ts | `d4f069c63c7b5e694c4db445dcd626dd1b6c4fa927d1cc42b5d71a8cfe8a1112` |
| exercise-activity.test.ts    | `950d9fa0b318253827084fecf62620c705de977d73ed71d4777e2989e9664f64` |
| named-exercises.ts           | `da4a3334476898f4b77ba03bb21a91626b147ec7735b7b5bdb2e8595e347844b` |
| named-exercises.test.ts      | `60f0ef7613a7142c6b1082c7d592fdd18f80b0251b857ee0f79a0dc2885e7dfe` |
| index.ts                     | `e719cbcb5a6d57ec6211170c8eb6d07427db0c4a2ab269ca4650c7d8758387e3` |

## User flows and limits

E1a exports are not accepted by current block writers and have no runtime
journey. Existing guide/scenario behavior is unchanged. Mapping integrity passed;
execution waits for runtime changes. No browser, DB, source authority,
model, generation, checking, persistence or learner-UI proof is claimed.

## Review

See [REVIEW.md](REVIEW.md). Independent source review found no material findings
and confirmed unchanged active writer boundaries, source hashes and adequate
checkpoint proof. E1a approval does not approve later integration or whole-feature
completion. Whole feature remains In progress.

## E-4 — E1b content lifecycle checkpoint (2026-11-14)

- Contracts named-exercises/learning-blocks/knowledge-interactive:3files106tests pass.
- Web named-exercise-content and existing knowledge-learning-block-editor:2files28tests pass.
- Backend learning-block-revision/block-copy-selection/workbook-copy/workbook-learning:4files49tests pass1.29s, including restoring host-frozen origins after model alteration.
- Contracts ESM/DTS build and typecheck pass. Scoped stage lint/format and whitespace checked before commit.

Initial copy regressions reproduced three cases (wrong material kind, removed
vocabulary entry, removed passage). Canonical document reference validation now
rejects them; follow-up source/copy tests pass. Material field edits require
explicit Custom conversion. Final independent/security/runtime proof is still
pending for the whole feature; no browser or live proof is inferred from these
checks. E1a hashes/review above describe history, not later modified source.

## E-5 — E2 activity definitions (2026-11-14)

`pnpm --filter @languon/backend exec vitest run src/modules/conversations/infrastructure/ai/exercise-activities.test.ts`

Pass82cases412ms. Covers all19valid/invalid artifacts, selected-only instructions,
fixed policies, actual choice/gap/key binding, exact vocabulary sense/grammar rule/
passage capture and source mismatch rejection. Scoped ESLint, Prettier and diff
checks pass. Subsequent API annotation only admits the exact existing Zod optional
undefined type; no behavioral source or test statements changed after that run.

## E-6 — Integrated focused preflight (2026-11-14)

- Application allocation/batches/outputcapacity/merger/registry/presentation/limitations/transport/taskvalidation:9files78cases.
- Studio namedtools/model/policy/registration:4files62cases; all19execute and strictoverrides fail.
- New manifest contracts42cases; private projection/reference authority13cases.
- Requestexecution/plannerbudget/contextualrunner:3files65cases; original62 retained plus manifest consistency/missing-source/conflict cases.
- E7 picker/renderer/attempt/evaluation/mentions/composer/admission/preference-retry:9files77cases.
- Current source-context/authoring/source-resolution/requestexecution/SDKfixture focused selection:6files76cases.
- Contracts/prompts packages built. Webtypecheck passes. Backendtypecheck has3identified Studio typing errors under repair; no final backend static success claimed yet.
- Scoped ESLint127files passed before later narrowlytracked source repairs; final scope repeats after stabilization.

## E-7 — Initial retained conversation gate (not passing)

Artifact: `test-results/critical-flows/7e0876bf-563f-4535-83ad-4c4107d8cb1c/ai-conversation.json`.
441cases,439pass,2fail,0skipped; run132.862s including guarded infrastructure.
The reduced55000-byte update case caught overlybroad revision schemas; narrow
exact-target output schemas preserve the original allowance and frozen sources.
The unrelated dictionary source snapshot regression caught a pre-existing inactive
customlabel projection; root applied the minimal owner-only effective-setting
override, keeping storedsettings and sharedreader guards. This failure is not
evidence of a cross-reader leak. Retained test remains unchanged; final gate
must rerun after both repairs. No pass/waiver is inferred from this initial run.

## E-8 — Final remediation preflight, 2026-11-14

Named catalog/contracts/current writer/evaluation/manifest selection:7files197cases
pass. Authoring, batch/operations and exact-target revision wire:4files46cases
pass, including producer prerequisite repair and collision-safe external source IDs.
Web typecheck and production build pass. Drizzle schema check and critical registry
validation pass (30 required journeys). Scoped145-file ESLint found46 mechanical
blank-line violations; automatic whitespace-only remediation passes.

Migration0170 is generated with Drizzle, then populated byte-for-byte from the
handwritten proposal authority SQL. Deployment fingerprint covers0169/0170 and
retains the existing production contract blocker. No shared database or paid model
is used. Final guarded DB/SDK run965f3a80-97dc-4d5f-99b2-52bc0bbc8afa is pending;
compilers and independent remediation/security reviews are pending.

## E-9 — Retained runtime remediation, 2026-11-14

-965f3a80… ai-conversation:480cases479pass1fail0skipped; only the new
target-guard regression expected version_conflict instead of the canonical
invalid_block_reference. Runtime rollback unchanged; test expectation fixed.

- c4b5cc20… ai-knowledge:79cases78pass1fail0skipped; unable named result
  correctly rejected a synthetic result without required emptycorrections.
  Both real-worker and browser HTTP fixtures now emit corrections:[], retaining
  strict validation and exact canonical private-persistence assertions.
  -3a3da6e1-8d1c-4675-a5cc-4aae47601d9a: final ai-conversation484pass0skip;
  ai-knowledge pending. Includes all64conversation-store DB cases, atomic target
  and media rollback, cohort commit, exact source dependencies/copy, lease and
  owner/shared guards, plus16realproductionSDK cases at unchanged budgets.
- Studio disposable runner:1/1pass14.66s after deterministic fixture covered
  every grounded source term. Exact19standalone primitive discovery is asserted.
  Focused model26/26pass. No live provider or real learner is used.
- c7119223… interactive-workbooks:4/5pass; partial/unable private feedback, reload,
  escaped hostilemarkup, existing authoring/sharing/revision journeys pass. Picker
  journey found its desktop button hidden by reused mobile-only CSS; remediation
  and rerun pending. Actual desktop/narrow screenshots await final designer review.
  -70db5094… admincatalog: new assertion incorrectly matched unprefixed IDs;
  actual canonical IDs use playground.generate_exercise_*. Fixed; rerun pending.
- Backend typecheck passes. Initial ESM build passes, declaration worker exhausted
  existing6144MiB; root narrowed inferred public schema boundaries and is rerunning
  without changing heap. Web build/typecheck pass before final picker CSS fix.
  -25readability mechanics,14style scanner cases and style contract pass. Scanner
  now distinguishes conditional domain tests from actual class-result expressions.
  Six selected webfiles59cases pass; all35guides and four affected mappings pass.

Final local doctor is ready:false because the identified loopback development
database has the two forward migrations pending. Disposable databases prove both
migrations; no ordinary development data was reset and no paid model was called.

## E-10 — Final selected context and gate evidence

Synthetic selected-only canonical authoring measurement (one question per activity,
UTF-8 JSON schema via z.toJSONSchema): V07 prompt6224bytes/schema4417bytes; R03
prompt6766bytes/schema6312bytes. Both return ready with exactly1AUTHORING call,
excluding planner/memory. These are bounded fixture observations, not provider
latency or pedagogical-quality claims. No all19definition/schema bundle enters
either call.

Retained runtime3a3da6e1… passes484conversation and79Knowledge checks with0skips,
247.057s including owned setup/build. Studio disposable journey1pass14.66s;
admincatalog final journey1pass26.7s (report in the run referenced by
/tmp/languon-067-admin-final.log). Both exact19tool discovery and visibleV01entry
are verified. Critical tooling92/92passes after reviewing the new93-suite
retained selection and keeping the existing setupflow order.

Independent rendered critique found no material defects in desktop selected
picker, desktop partial feedback and fullyscrolled390px unable feedback. Mobile
picker and final full generation journey remain pending. Desktop button was fixed
with an alwaysvisible class; mobile host now selects existing Tutor tab on open,
matching the existing launcher lifecycle.

## E-11 — Declaration emission diagnosis and guarded repair

Repeated ESM builds passed, but DTS exhausted its unchanged6144MiB worker.
Private/public schema boundaries and an explicit Studio composition interface
reduced inferred API exposure but did not resolve that gate; no success is
inferred from those attempts. Full strict backend typechecking passed repeatedly.

The installed TypeScript handleNoEmitOptions requests declaration diagnostics
for the entire program when noEmitOnError is true. tsup's default enables that
preflight before each requested source emission, serializing transitive internal
declarations that are not part of the nine executable entry outputs.

Independent completion_backend reviewed and approved a guarded repair: official
backend build unconditionally runs existing strict tsc --noEmit first; DTS-only
configuration then uses noCheck:true and noEmitOnError:false. Each bundled module
still undergoes declaration transformation, emitted-source diagnostics still fail
the build, and Rollup still validates/resolves the generated declarations.
The same nine entries,6144MiB limit, ESM/DTS output and SQL asset copy remain.
CLI --dts is removed because its boolean would replace the configured DTS object.
No source/schema validation or required automated test is weakened.

Final official guarded build is pending. Completion requires its typecheck+ESM+
DTS+assetcopy success and all nine declaration files present/nonempty. The prior
noCheck-only run was stopped as task-owned PID63090 after confirming the missing
noEmitOnError override; no unrelated process/service was stopped.

## E-12 — Final technical gates passed, 2026-11-14

- Official `pnpm --filter @languon/backend build` passes full strict typecheck,
  ESM, DTS and migration asset copy at the unchanged6144MiB limit. Declaration
  emission189.332s. All9expected.d.ts files exist and are nonempty, including
  executable-only13-byte export{} declarations. Copied0169/0170SQL hashes match
  source2dc54c03… andc05473bd…. Prior log includes the explicitly stopped earlier
  PID's delayed143footer; final tool session69835 exits0 and all outputs verify.
- `pnpm --filter @languon/web build` passes on final UI source; web typecheck and
  style contract pass. Backend full typecheck also passes independently.
- Retained backend groups:3a3da6e1-8d1c-4675-a5cc-4aae47601d9a,484conversation
  +79Knowledge cases,0failures/0skips. Both forward migrations are applied to
  owned disposable infrastructure; all atomic/source/privacy/settlement guards pass.
- Final `interactive-workbooks` browser: e8372078-5c42-4e43-b6d3-0b7ffcb5ee24,
  5/5pass,76.239s,0skips. TypedV02generation→Review→Insert→explicitClose→Save→
  reload retains source content and semantics.activity.id; expanded card displays
  name/checking policy. Manual Custom conversion removes semantics in savedAPIbody.
  V07partial/unable feedback persists privately and hostileHTML-shaped text stays
  literal with0img[onerror]. Healthy runtime asserts console/unexpected5xx.
- Admincatalog browser:62d10962-7886-4dec-a3e9-6ca02d12a9ae,1/1pass,0skips,
  exact19staticdefinitions and visibleV01entry; read-only interactions remain.
- Studio disposable mapped journey:1/1pass,14.66s; exact19primitive discovery,
  canonical generation/session persistence/isolation/reset. Model26/26pass.
- Final fixture-dependent5filepreflight176/176pass; selected contracts197/197,
  prepared/domain checks, provider4/4, prompt1/1 and frontend selections pass.
- Critical tooling92/92 and readability25/25pass. Style scanner15/15pass;
  no Tailwind leakage or weakened class-result detection.
- All35guides and four affected mappings pass; registry validates31journeys.
  Scoped final lint, format and diff preflight pass. Final independent backend, frontend and security evidence approval pass; all
  material findings are resolved.

Rendered critique approves representative1440/390picker, expanded named card,
partial desktop and unable mobile states. Mobile source focus, count/activity
controls, no horizontal overflow and Cancel/Prepare actions are covered across
maintained journeys/isolated tests and screenshots, without claiming a full
viewport/locale cross-product. Security evidence approval confirms unchanged
sensitive-source hashes and all required real SQL/browser proof with no findings.

Operational limits: ordinary loopback development database still has the two
forward migrations pending, so configuration doctor reports ready:false. It was
not reset or migrated by this verification. No paid provider request was made;
production-provider language quality remains unproven. Production deployment
remains blocked by the pre-existing contract classification. No push is performed.

## Final closure

Feature067 is technically complete and independently approved on2026-11-14.
Source/evidence integration commit569733d1 retains the final verified state.
153-file ESLint, changed-file Prettier and git diff checks pass after mechanical
format cleanup. Feature artifacts and roadmap reflect completion; broader
BL-003/006/007 remain In progress. Local squash integration preserves all stage
commits on the feature branch, with no push or branch deletion.
