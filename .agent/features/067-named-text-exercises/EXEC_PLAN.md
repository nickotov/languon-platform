# ExecPlan: Named text exercises

## Goal and specification

Implement [FEATURE.md](FEATURE.md) step by step. User approved Feature2/E1 on
2026-11-13. Branch `feature/named-text-exercises`, base `1397126d`.
Current status: Complete. All 19 priority activities, integration stages, selected
technical gates and independent completion/security reviews are approved. Local
squash integration into main closes delivery; stage history remains on the feature
branch. No push or branch deletion is authorized.

2026-11-13 continuation: user authorized continuing through all remaining stages,
committing each completed stage and notifying when the whole feature is done.
Keep reviewed stage commits on this branch; root feature policy still requires
one local squash integration into main after final verification, without pushing
or deleting this stage-history branch.

## Existing architecture

- `packages/contracts/src/learning-blocks.ts`: strict three-format exercise contract; choices/gaps/acceptedAnswers; passage-only sources.
- `packages/contracts/src/workbook-learning.ts`: current correct/incorrect/unchecked evaluations; E6 extends consumers atomically.
- Backend `modules/knowledge/domain/workbook-learning.ts`: semantic revision and prepared checks; free text currently unchecked.
- Backend `modules/conversations/application/learning-content-{contract,task-validation,output-contract}.ts`: compact capability, format rotation and complete-output validation; E3 changes allocations.
- Web `features/knowledge-notes/lib/read-exercise-block-form.ts` reconstructs fields, so immediate schema widening could silently discard named identity. Copy helpers require provenance remapping. Writer activation waits for E1b.
- Read root/app/package instructions, feature065 completion, F059 relevant current state, matching guide metadata and ADR-0050/0052/0055. No new durable architectural rule needed for additive unused exports.

## Decisions

- D1 — Split E1 into catalog/isolated contracts E1a and atomic active-consumer integration E1b. Do not accept named fields before edits/copies/evaluation preserve them. E1a is foundation, not a learner journey or completed AC-2.
- D2 — Stable version1 IDs/policies follow roadmap; display locales en/ru/fr/es match web. Pedagogical source kinds are not access grants. Detailed generation rules remain backend infrastructure in E2.
- D3 — Standalone provenance contracts bound content references/snapshots, never authenticate them. Actual authorization/remapping/revisions and answered-snapshot linkage belong in E1b/E4.

## Test strategy (recorded before coding)

### Continuation strategy — E1b–Final, 2026-11-13

E1a committed as `0f430cb9`. Commit each stabilized stage with its evidence;
parallel workers have explicit nonoverlapping file ownership. Root owns integration,
shared compilers/builds, authoring/tools/source authority, stage records and Git.

Affected AI matrix seams: authoring/planning schema and instructions, source
resolution, dependent-call reservation and explicit answer-evaluation schema.
Provider routing/models/accounting policies/deadlines are unchanged. Retain real
production composition with only external HTTP replaced, bounded reduced-budget
and invalid-output repair, source denial, cancellation/fences and atomic proposals.

Selected checks, before substantive continuation coding:

- E1b: contracts named/learning-blocks/knowledge-interactive suites; web `tests/named-exercise-content.test.ts`; backend `modules/knowledge/infrastructure/persistence/drizzle/workbook-copy.test.ts`; affected domain semantic revisions (E6 worker). Estimated seconds; shared contracts build first for dependent workspace imports.
- E2: backend `src/modules/conversations/infrastructure/ai/exercise-activities.test.ts`, all 19 valid/invalid activity fixtures and selected-only prompt assembly, <10s.
- E3–E5: backend application `learning-content-*` and `exercise-activity-allocation` plus infrastructure `learning-content-{authoring,batching,operations}` and `tutor-request-{execution,sources}` regressions. Add actual-source dependencies, exact allocation/order, no partial publication, one repair and conserved future capacity. Estimated 5–30s focused iteration.
- E6: contracts workbook-learning/knowledge-exercise-evaluation; backend domain workbook-learning and AI evaluation provider regressions; real disposable DB learner-store and field-action SQL publication/fencing/revocation cases (cold 1–3m). Generate forward SQL from handwritten function source via the established migration script, never hand-edit generated migrations.
- E7: targeted web picker/render/editor/component tests and isolated stories; desktop1440/narrow390 real browser through pinned safe wrapper; affected registered `interactive-workbooks` plus knowledge-generation journeys under guarded disposable infrastructure (estimated3–8m warm, inspect setup first). Specialist tester owns traceability and complementary persistence/E2E assertions, not duplicate author unit checks.
- Production execution: retain `tests/integration/modules/conversations/conversation-production-execution.test.ts` with actual admission/model gate/SDK; exact Knowledge action execution suites discovered with E6 worker. Use existing test environment ownership/guards and synthetic data; no paid provider in automated checks. Broad unrelated consumer bundles are not selected.
- Static: contracts/backend/web typecheck and affected builds, scoped lint/format, guide checker/mapping checks and critical registry validation. Run after source preflight stabilizes; root alone owns shared artifacts.
- Final source review plus risk-triggered security review cover model tools/provenance/private attempts/publication SQL. Final evidence approval follows successful selected gates and remediation. UI designer supplied source-based brief; rendered critique remains required.

Baseline `pnpm dev:doctor -- --capability knowledge-actions --phase configuration --json`
could not inspect the local environment (env/database/build readiness unavailable),
before continuation edits. This is an explicit readiness gap, not an implementation
blocker; repeat on the authorized isolated test target and at handoff. No live
dispatch until local readiness and standing AI smoke guard preflight pass.

Direction E7: extend existing BlockEditorPanel desktop side panel/mobile sheet,
existing block action hooks/composer row and tokens. Picker hierarchy source →
Automatic/selected activities → count/languages/difficulty → allocation/footer.
Retain exact source summary and errors; no silent source substitution. Source
brief from independent ui-designer is accepted under approved-pattern extension;
root retains product decisions.

Root owns compilers/builds, named semantics/tests/exports and records. Catalog
worker owns only activity catalog/schema/data/tests. No overlapping edits.

- `pnpm --filter @languon/contracts exec vitest run src/exercise-activity.test.ts src/named-exercises.test.ts src/learning-blocks.test.ts src/knowledge-interactive.test.ts src/workbook-learning.test.ts`: catalog/policy/key/rubric/provenance invariants, strict current-writer refusal and unchanged blocks; estimated 2–15s.
- `pnpm --filter @languon/contracts typecheck` and `pnpm --filter @languon/contracts build`: public exports/declarations; estimated 15–60s.
- `pnpm exec eslint <changed TypeScript>` and `pnpm exec prettier --check <changed files>`: root readability/style; estimated 5–20s.
- `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check interactive-workbooks`, `pnpm user-flow:e2e -- check mastra-agent-development-harness`: unchanged mapping integrity; estimated 2–15s.
- Bounded independent source review after preflight for schema invariants/staged writer safety. Whole-feature completion review remains pending for later slices.

E1a changes no AI execution/prompt/model/configuration/worker, persistence,
rendering or active input boundary. Doctor/live smoke/DB/browser/E2E execution
and AI matrix runs are inapplicable to this checkpoint; select them when those
production seams change. Automated checks never call paid providers.

## User-flow documentation and backlog

No executable journey/command changes in E1a, so existing guide revision markers
stay unchanged. E1b onward updates workbook/workspace/playground docs and mapped
scenarios when behavior changes. Related BL-003/006/007 remain In progress;
link partial delivery without rewriting historical evidence or declaring Done.

## Milestones

- [x] E1a — Catalog and standalone semantic contracts; AC-1/foundation of AC-2; selected contract/static/export checks and bounded review. Evidence E-1–E-3; reviewer found no material issues.
- [x] E1b — Active contracts, semantic revisions, protected edits/copies and prepared-policy consumers; focused source checks pass (E-4), final completion/security review also passes (E-12).
- [x] E2 — All 19 backend definitions, canonical source capture and artifact validators;82focused tests pass (E-5).
- [x] E3 — Tools, activity allocations and selection; AC-3/4.
- [x] E4 — Exact source/dependency grounding; AC-4.
- [x] E5 — Capacity and atomic publication; AC-5.
- [x] E6 — Checking and structured feedback; AC-6.
- [x] E7 — Picker/editor/rendering; AC-7.
- [x] Final — Required deterministic/real-runtime proof, guides, independent completion/security review and squash integration; AC-8.

## Historical checkpoints and discoveries

2026-11-13: clean main baseline, feature067 and authorized branch created.
E1a implemented: 19 immutable localized catalog definitions and strict named
semantic/key/rubric/source contracts, exported publicly. Selected checks pass;
independent reviewer approves the bounded source with no material findings.
Passage-only active provenance and unchecked free text still require integration;
new metadata does not imply those capabilities work.

## Validation and remaining work

[EVIDENCE.md](EVIDENCE.md) owns results; [REVIEW.md](REVIEW.md) owns review.
E1–E7 are committed separately and the final integration/evidence source commit is
569733d1. All selected gates, final source/coverage review, security evidence review
and rendered critique pass. Historical checkpoint entries below retain their
then-current pending work; this closure supersedes those interim statuses.

### E1b checkpoint — 2026-11-14

Canonical blocks now accept optional named semantics; absence remains deliberate
Custom. Keys bind to actual answer IDs/values. Named form/AI revisions cannot
silently lose identity; AI revisions retain host-frozen provenance. Copies remap
UUIDs and include local vocabulary/grammar/passage dependencies. Canonical document
validation rejects wrong source types and removed entries/segments. Meaningful
named/source changes affect server semantic revisions. Prepared checking policy
is integrated atomically with active contracts so hybrid misses cannot become
incorrect merely because the later AI-feedback stage is pending. E6 still owns
structured AI results, fenced persistence and provider prompt/schema changes.

Frozen selected prose supports the existing40000-character source envelope and
unsaved Knowledge version0; no arbitrary foundation-only source cap is retained.
Targeted contracts106, web28 and backend49 cases pass; contracts build/typecheck
pass. Whole-feature runtime/source/security review remains pending; this is a
verified implementation-stage commit, not final completion approval.

### E2 checkpoint — 2026-11-14

E1b committed4e66432f. Backend-only definitions expose input/objective/prompt,
constraints, explanation requirements and rejection cases for all19 tasks.
Selected-only instruction assembly and strict key/source validators pass82cases;
canonical vocabulary sense and grammar rule capture helpers prevent reconstructed
material. Semantic/pedagogical truth remains an authoring/model-review obligation.
No provider/generation path is activated by this standalone definition commit.

### Integrated preflight and first retained gates — 2026-11-14

Completed stage commits: E1a0f430cb9, E1b4e66432f, E2c4252357. Root integrated
application allocation/dependencies, host sourceBindings capture, pending snapshot
registry and deduplication, typed picker choices with planner contradiction checks,
19Studio tools and narrow authoring schemas. Language overrides and original
pending source versions survive clarification; private retries cannot inject a
new selector/manifest. Frontend picker/checking/stories and structuredfeedback
provider/SQL source are implemented; final runtime evidence remains pending.

Focused preflight: application9files78cases; Studio4files62cases; manifest42 and
reference13 cases; web9files77cases; named schema/SDK fixtures all19; actual
request/planner/runner3files65cases; evaluator provider/domain22 plus prompt1.
Contracts build/typecheck and webtypecheck pass; scoped127source lint passes.
Backend typecheck diagnosed3Studio typing errors assigned to its worker; root
repeats after source freezes. Exact test path lists are in stage evidence/agent
reports and will be consolidated before final review.

First retained ai-conversation run (7e0876bf-563f-4535-83ad-4c4107d8cb1c) ran
441cases:439pass,2fail,0skipped. A broad all-renderer revision output schema
exceeded an existing55000-byte reducedadmission limit after named contracts grew;
root replaced it with exact selected-target schemas and host-restored provenance,
without increasing any allowance. Focused request32cases pass; new revision-wire
regressions added. Second failure was pre-existing dormant customnotation label
in an owner's frozen dictionary generation context; baselinecode/test hashes
match1397126d. Approved one-field projection fix preserves stored dormantsettings,
shared-reader policy and historicaldata; current snapshot/model excludesinactive
labels. No test weakened or new authority added. Security review includes this
bounded mandatory-gate correction. Retain its original integration regression.

Knowledge AI realDB/SDK selection running independently in owned disposable
infrastructure (fe0d030a-a470-44a2-869c-a0463d3704e2); whole feature not complete.

### E3 source checkpoint — 2026-11-14

Activity allocation, compact planner capability, typed picker manifest and19fixed
Studio tools are integrated. Actual SDK/model tool fixtures all19 pass; selected
application/tool/catalog preflight72cases and subsequent Studio/fixture/catalog/
authoring4files69cases pass. A new producer-prerequisite prompt line exposed two
synthetic source-projection parsers that assumed a later marker; both now parse
the exact single serialized source line. No provider limits changed. E3 source
checkpoint is committed separately; Studio runtime and final milestone approval
remain part of the final gates.

### E4 source checkpoint — 2026-11-14

E3 source commit84f801b4. Host captures exact typed source material, keeps original
versions through clarification/retry, prevents manufactured model prose and ID
collisions from becoming authority, and preserves historical origins when copying
or inserting. R03 now has explicit three-way roles and required absence rationale.
Real disposable conversation-store run confirms all new named source dependency,
wrong-kind/foreign/missing source, historical origin and independent-copy cases.
Run965f3a80… totals480:479pass, one unrelated new rollback-test error-code
expectation corrected without weakening rollback assertions. Migration activation
and metadata are committed with E6's coupled forward-migration cohort; no shared
DB or production deployment is authorized. Source checkpoint is not final approval.

### E5 source checkpoint — 2026-11-14

E4 source commit9a07776a. Dependent batches reserve future calls/output and repair
invalid producers before downstream authoring. New identities reserve external
source IDs. Multi-target revisions use one publication transaction and expose
receipts only after the complete commit. RealDB media-guard rollback and successful
cohort tests pass; target-guard test retains the canonical invalid_block_reference
code and all zero-row/unchangedbranch checks for rerun. All16realSDKproduction
execution cases pass at existing budgets; authoring/revision4files46cases pass.
Backend, frontend and security independent source phases approve the remediated
source. Final runtime/evidence approval remains pending.

### E6 source checkpoint — 2026-11-14

E5 source commit6c0a619b. Structured criteria/corrections/suggested answer support
partial and unable learning outcomes separately from execution. Ordinary prepared
checking remains model-free; explicit AI remains available for every format and
never mutates published keys. Contract197, provider4, prompt1 targeted cases pass.
Forward migrations0169/0170 are generated and populated from canonical functions;
ownedDB applied both, source/lease/settlement/revocation/private-reader checks pass.
The only remaining knowledge gate failure was a named unable fixture omitting
required emptycorrections; fixture and exact persisted assertion are corrected.
Rerun remains required. Production deployment classification remains contractblocked.

### E7 source checkpoint — 2026-11-14

E6 committedeb9fb51e. Localized picker, composer/source actions, editor Custom
conversion, role labels and prepared/hybrid/structured feedback renderers plus
isolated stories are implemented. Independent frontend source/remediation review
approves the final desktop button and existing Tutor mobile-host selection fixes.
Web production build/typecheck pass; selected component tests and style checks
pass. Desktop selected picker and390px feedback have independent rendered critique.
All existing workbook/sharing/revision and new private-feedback browser journeys
pass. New named lifecycle reaches desktop/narrow picker, focus and explicit Send;
a synthetic HTTP authoring fixture mismatch is under specialist remediation before
final browser acceptance. Admin catalog realbrowser passes all19definition
discovery and visible entry; Studio disposable journey passes exact19tool discovery.
This source checkpoint does not claim final browser or feature completion.

### Final gate continuation — 2026-11-14

E7 source committed5606fe46. Retained realDB/SDK gates pass484+79 cases without
skips, all19Studio tools have real disposable discovery/execution proof, admin
catalog browser passes1/1, and final web build/typecheck pass. Independent rendered
critique covers desktop/narrow picker and partial/unable feedback without material
visual findings. Backend typecheck passes after explicit Studio composition type
boundaries. Declaration build remains pending: existing6144MiB worker still
exhausted after the initial outer-boundary experiment; root now stops the expanded
proposal Zod graph at a DTO-backed output schema boundary, preserving validation.
No heap increase, timeout increase or required assertion removal is authorized
by this diagnostic repair. New workbook generation fixture and final named browser
lifecycle remain under specialist verification.

### Technical gate closure — 2026-11-14

All scoped technical gates now pass, including official backend strictcheck/ESM/
DTS/assets and final5browserjourneys. All9declaration outputs and both copiedSQL
hashes are verified. Evidence E-12 records final artifacts; source and test fixes
are ready for the final verification commit. Final independent evidence approval
and local squash merge remain. Local readiness/live-provider limits are explicit
operational follow-ups, not a claim of production deployment.

### Final completion — 2026-11-14

Independent completion_backend, frontend_final and security_final approve the
remediated implementation and final evidence. Designer approves the representative
rendered states. Source commit569733d1 contains the verified integration. Final
153-file ESLint, changed-file Prettier and git diff checks pass; last adjustments
are mechanical-only and preserve the retained runtime/build evidence. All35guides,
four affected mappings and31journey registry validate.

Local integration uses one squash commit on main from the authorized feature
branch; all individual stage commits are retained and no branch is pushed/deleted.
Ordinary local DB migration0169/0170, paid-provider language-quality proof and
production rollout remain explicitly outside this verification result. The local
database was not reset. Retrospective follows later user acceptance and does not
delay technical delivery.
