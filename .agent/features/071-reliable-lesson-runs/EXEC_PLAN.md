# ExecPlan: Reliable lesson runs

## Goal and specification

Implement [FEATURE.md](FEATURE.md) and the [detailed documented plan](../../../docs/reliable-lesson-runs-implementation-plan.md). The plan was committed as `51f2908d` and its implementation as `5adafe92`. Branch: `feature/reliable-lesson-runs`, base `463b04ff`. Root owns integration/contracts coordination, migrations, language resolution, docs, expensive DB/compiler/browser gates. Bounded workers own authoring, autoauthority backend, contracts, frontend and test source; reviewer/design roles stay read-only.

## Existing architecture and decisions

Feature070 provides typed plans, private immutable checkpoints, one canonical mixed proposal, existing turn workers/leases and independent accounting receipts. The prior incident validates model calls can complete yet produce rejected outputs. This follow-up changes per-stage manual interaction into bounded server advancement and read-only prepared preview; ADR-0061 records partial supersession. Keep original action limits and whole-session configured financial ceilings. No direct client scheduling, new provider, generic workflow engine or paid test service.

## Milestones

- [x] M1 contracts, public documented plan and accepted ADR (AC-2/3/4/6).
- [x] M2 exercise units, recovery diagnostics and language regression (AC-1/2/7).
- [x] M3 durable budget authority, server chaining and lifecycle fences (AC-4/5).
- [x] M4 owner preview and approved-pattern interface/stories (AC-3/6).
- [x] M5 focused real integration/browser/static/build/docs gates and independent review (AC-8).

## Verification selected before implementation

Contract/unit tests for changed schemas, batching, partial resume, repair/error classification and language resolution. Production-worker/real-accounting regression on disposable PostgreSQL; root alone resets it. Exact checks added with test ownership before execution. E2E `knowledge-workspace` continuation scenario changes to automatic advance and prepared preview; preserve full Insert/Save/reload. Approved UI extension reviewed by ui-designer, then rendered desktop1440 ENlight/mobile390 RUdark. Focused lint/readability/styles/typecheck/build and guide/diagram checks. Baseline `conversation` doctor captured at `/tmp/reliable-run-baseline-doctor.json`; live paid proof separate and not implied by fake HTTP. Estimates and consumer risk matrix are in the detailed plan.

## User-flow/backlog traceability

Update knowledge-workspace, contextual-language-assistant-and-knowledge and interactive-workbooks where changed behavior/source mappings require. BL-016 stays In progress; only owned Knowledge lesson composition advances. No new unrelated journey is included.

## Progress

2026-11-17: User authorized complete implementation and no commits. Detailed public plan written before substantive implementation. Source-based UI brief selects existing LessonRunCard, proposal-review dialog/sheet and KnowledgeDocumentView patterns. Contract and authoring work beginning; automatic budget boundary implementation underway. No final evidence claim.

2026-11-18 verification checkpoint: contracts, authoring, language policy, automatic-authority source, owner preview and web UI implemented. Generated 0177 adds nullable authority/failure fields; 0178 adds the matching ready-run partial index. No local development migration applied yet. All work remains uncommitted. Root owns expensive gates and database resets.

Focused evidence: contracts24 original cases; authoring67; language62; prefix-remediation31; web43; preview remediation23; reference-label12. Backend and web typechecks passed early preflight; final changed-test typecheck pending. Real DB `core-db3` passed eight selected modes/vocabulary case; its sole remaining failure was an incorrect test expecting 10000 per attempt instead of the existing4096 call cap. Corrected test also asserts five calls/10000 actual output per action. Full production/store/accounting selection currently running (`/tmp/reliable-run-core-db4.log`). Real financial helper proof2 passed (`/tmp/reliable-run-financial-db1.log`); funding variants are being added.

Independent source reviews found and remediated: automation expiry must not exceed the root credit action deadline; old exercise prefix admission must skip exactly the same units as execution; partial vocabulary must expose actual20/200 progress; preview order must follow plan.outputOrder; denied preview refetch must purge/hide cached bodies. Rendered desktopENlight/mobileRUdark review has no blocker/major; reference-answer wording fixed and reobserved. Original paused-run history is preserved.

Remaining: final Stop race/customer+operator/unlimited/zero-tariff/unknown-liability proof, source/HTTP preview denial, complete browser Insert/Save, final static/build/docs/freshness and independent evidence approval. Browser E2E exposed Escape propagation from prepared preview into tutor Stop; frontend is isolating that key event before rerun. Existing mixed-content and fifty-word proposal browser cases already passed in `/tmp/reliable-run-e2e1.log`. Earlier failed fixtures/runs are retained as diagnosis, not passing completion evidence. No paid model call performed.

2026-11-18 final-gate checkpoint: all128 realDB production/store/financial/accounting cases pass, automatic browser journey+HTTPprivacy passes, backend131/contracts21/web55 final unit cases pass, responsive UI and architecture viewer reviewed. Both production builds exit0; static/readability/style/guide/diagram checks pass. Additive migrations0177/0178 applied locally and final doctor ready:true. Original affected run read-only preview validates all3savedparts withoutchanges. Security final evidence approved; completion evidence approval pending final readback. No commits, merge or push performed.

Final independent completion evidence approved on 2026-11-18 for base `463b04ff` and 85 implementation/test/migration files SHA-256 `07fe6d2ceb2eea6afc3418fdb099271750e4fc4a9adb4f0a8aee4b5df9f25f82`. All acceptance criteria and selected gates complete. Final bookkeeping only follows; runtime source is unchanged. User requested no commits: leave complete reviewed patch uncommitted on feature/reliable-lesson-runs. No live paid-provider proof is claimed.

## Production follow-up: stale development worker and failed-output UX

Status: Complete. All implementation, selected gates and independent final evidence approval are complete. The completed M1–M5 evidence above predates this follow-up. Follow-up evidence and the current 90-file source manifest are recorded in EVIDENCE.md.

Implemented development-only `tsx watch` with a real imported-module reload test, safe unknown/UUID fallback and localized UI/story, compact output-limit repair under unchanged caps, generated-prose source-binding instructions, and safe transport classification after pinned routing finishes. The actual paused plan was repaired through the transaction-bound existing revision path: revision 1→2, only two pending exercise explanation languages changed to French, saved reading identical, no action/attempt/charge/proposal changes or model dispatch. Temporary operational scripts were removed. The local development supervisor restarted with the watched worker; final capability doctor reports ready.

Checks: 57 authoring, 13 contracts, 16 UI and 24 tooling tests pass. Real PostgreSQL/Redis selection passes 10 tests covering safe failure projection, checkpoint retention and production execution. Backend/web typechecks and production builds pass. Final browser journey and four HTTP prerequisites pass; desktop/mobile unknown-failure rendering, readiness, guides and diagrams are verified. Independent source, security and final evidence reviews approve the current source manifest. No paid-provider execution is claimed.

2026-11-18: User reports new run `prose → R01/R04/R08 → grammar → five grammar exercises` stopping after the reading. Read-only numerical DB inspection confirms both attempts failed, first exercise candidate rejected at3690/4096 output tokens, retry used4096/4096; no failure diagnostic was persisted. API admission carries current authority metadata, but stored explanation languages and missing diagnostics match an older loaded worker. Current source worker process began07:43UTC, after both failed attempts07:36–07:39UTC. Development command runs non-watched `tsx` while API source watches changes, permitting API/worker code skew. Exact historical schema field cannot be recovered; do not invent one.

Authorized follow-up scope: make development worker reload imported source, surface an honest bounded unknown-failure fallback/support reference for older failed runs, align the stale bilingual-only system source instruction with generated prose, and give known output-limit repair explicit concise-regeneration guidance under unchanged caps. Preserve saved artifacts and pinned plan semantics; no unapproved model dispatch. Validate prose→R01/R04/R08 with current code and robust compact repair. Keep all work uncommitted.

### November 18 follow-up on the final exercise and repeated run-list requests

- Use the conversation stream for active progress. Bootstrap run history once and reconcile after a stream gap. Fence late reads so a stale running snapshot cannot overwrite a streamed failure.
- Ask for G03 accepted answers once. Compile the canonical hybrid checking key in the host before validating the finished block.
- Before starting another durable exercise in a partially consumed stage, reserve sufficient provider calls and output for its repair. Hand off saved progress automatically and resume from the next missing unit.
- Surface the failed exercise, saved prefix, localized validation reason and retry action even when the stream reconnects.
- Verify provider wire and compiler, stage budgets, checkpoint reuse, cache races and terminal UI. Exercise automatic continuation in the production worker and count actual browser requests through final insertion and reload.

### Incident recovery extension

Feature implementation continues under AC-9 through AC-12. [The committed plan](INCIDENT_RECOVERY_PLAN.md) records the observed run identities, diagnosis, implementation sequence and required evidence.

The incident recovery extension is complete. AC-9 through AC-12 passed the selected worker, browser, accounting, documentation and build gates. See the incident sections in EVIDENCE.md and REVIEW.md for completed checks and the live-provider verification boundary.

### First reading response rejected after plan creation

Trace the reference using only stage, receipt, validation and accounting metadata. Reproduce a measured malformed first reading at the real pinned router boundary. Normalize both terminal forms at that boundary, compile a compact reading into the existing canonical document, and expose safe phase/finish evidence. Exercise one valid repair, repeat rejection, refusal and manual continuation of an already saved plan. Verify the complete French four-part lesson through one prepared proposal, then rerun the scoped browser, contracts and builds.

### Confirmed continuation rejected at the second comprehension exercise

1. Inspect the offered quote, time window, aggregate usage and attempt receipts by opaque IDs. Preserve learner content, billing, checkpoints and existing authority. Verify the rolling limit against the actual hard-bounded prospective stage and per-call demand.
2. Correct admission and pre-dispatch capacity projections under their existing serialization fences. Check at quote creation and again when confirmed. Retain genuine denials, operator limits and concurrent reservation accounting. Cover the real edge numerically and test an actually exhausted window.
3. Reduce the R08 authoring format to facts the model must supply. Compile generated gap identities and the corresponding answer key together, then run canonical validation and source binding. Test the pinned SDK and the unchanged canonical preview/checker.
4. Show the admission outcome on the initiating run with the correct support reference. Preserve the saved reading and exercise progress after denial. Run focused contract, application and UI checks, the user-flow mapping, disposable PostgreSQL worker/quote verification, relevant typechecks/builds and independent review. No live provider retry or changes to the historical quote.

AC-13 is implemented. The reviewed migration was applied to loopback development only. The reconstructed quote passed the bounded predicate in a read-only check. The incident-specific and shared PostgreSQL suites, browser journey, documentation and production builds passed. The learner can resume the saved run by authorizing a fresh quote.

### November 19 single-submission design proposal

The latest R04 retry loop was traced to a demonstrated authoring/canonical contract mismatch and stage-scoped recovery. [Single-submission design and acceptance plan](SINGLE_SUBMISSION_PLAN.md).

Plan committed as 51f2908d. Implementation uses ADR-0062, catalog-specific educational inputs and a revision-scoped recovery history. Verify with serialized provider contract tests, the 3+5 production worker composition, paid quote and settlement cases, lease/Stop cases, the mapped browser journey, migration readiness and application builds. Live provider reliability requires separate evidence.

The single-submission extension is implemented. The final worker matrix covers 47 production-composition cases. The original saved revision passed read-only validation under the new projection. Use the November 19 entries in EVIDENCE.md and REVIEW.md for the exact checks, funding boundary and remaining live-provider gap.

### Post-acceptance review

The user verified the lesson flow locally and requested a commit and review. The implementation was committed as `5adafe92`. Review identified two handoff cases and the fixes were committed as `9582d611`. Future regression checks should click the composer Stop while the lesson is between stages and compare every continuation action’s dispatch deadline with the root deadline. Both are now in the mapped tests.

The four affected production-worker cases took 16 seconds on disposable infrastructure. The two Chromium journeys took 60 seconds. Investigation, editing, setup and rework times were not separately measured.
