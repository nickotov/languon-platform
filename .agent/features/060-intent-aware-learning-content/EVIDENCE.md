# Verification evidence: Intent-aware learning content

Updated: 2026-11-04
Status: Complete implementation; explicit residual real-provider proof gap.

## Acceptance and layers

| Criteria   | Implementation                                                                                                   | Evidence        |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | --------------- |
| AC-1, AC-6 | Strict durable response metadata, fenced projection, document action guard                                       | E-1, E-2, E-4   |
| AC-2, AC-3 | Standalone tools/registry, host exact sources, compact pending state, complete task patching, disclosed defaults | E-1, E-2        |
| AC-4       | Full-set authoring/copy validation, bounded admission/accounting, successful-origin publication gate             | E-1, E-3        |
| AC-5       | Exact same-chat readback, bounded recent catalog, source/target authority                                        | E-1, E-3        |
| AC-7       | Static/build/runtime/docs/independent/security evidence and explicit live-proof limit                            | E-1–E-7, REVIEW |

## E-1 — Final registered backend critical stage

`pnpm test:e2e:critical -- --flow ai-conversation`

Final: **222 tests / 13 files passed, zero skips**, including real SDK, production composition, operation/accounting/memory/portrait isolation, typed authoring, exact source transport, pending resume, output feasibility, restricted SQL role and proposal lifecycle regressions. Only external provider HTTP is replaced where required; no automated paid calls.

Evidence: `test-results/critical-flows/62cc6004-ad2f-4d65-9447-1de8676b86af/` (run report, backend native report, per-file counts and source metadata). Earlier stabilized source stage passed219; final222 includes the natural catalog revision compatibility cases. An attempted parallel stage correctly refused the generated-file lock; it was rerun after browser teardown, without bypassing the guard.

## E-2 — Real browser / mapped journeys

Reviewed guarded contextual-assistant runner, exact files `knowledge-workspace.journeys.spec.ts` and `interactive-workbooks.journeys.spec.ts`.

**All12cases pass**, no retries/skips:11valid unaffected cases retained from `feature060-final-wire-proof`, plus the affected existing natural-revision/copy/inline-feedback journey rerun against final catalog guard in `feature060-catalog-revision-final` (36.4s case;43.6s run). API prerequisite4/4pass (6.53s). Last source delta affects only no-chip revision authority, so unaffected browser evidence remains valid under DELIVERY reuse rules.

Artifacts under `apps/web/.next/playwright/contextual-assistant-results/`:

- `feature060-final-wire-proof/knowledge-workspace.journe-f0753-viewed-interactive-proposal/intent-mixed-proposal-desktop.png`: capability response without document action, metadata reload, one coordinated vocabulary+grammar+three-exercise proposal, Apply/Save/reload.
- `feature060-catalog-revision-final/interactive-workbooks.jour-3adfb-private-inline-alternatives/`: chat-target-update-review, prepared-audio-chat-review, prepared-audio-chat-review-mobile, inline-exercise-feedback-desktop screenshots.

No console/network regressions in passed journeys. Teardown restored canonical generated `next-env.d.ts`; no test servers remain.

## E-3 — Disposable PostgreSQL and source authority

Feature-owned loopback55560 database, disposable-test guard enabled. Entire conversation-store suite52/52pass (17.10s final expanded readback proof); also included in E-1. All migrations0162–0164 applied from a clean schema. Verified current-turn internal read, later successful read, failed/cancelled later read rejection; active/failed/cancelled proposals cannot list/apply; completed ones can; owner/lease/source mismatch rejects; metadata persists canonically/replays and stale writes reject. Restricted worker has exact function EXECUTE without broad proposal SELECT.

Feature-owned container and its anonymous volume removed after zero-client ownership verification. Shared containers/databases untouched by reset recipes.

## E-4 — Focused and mechanical checks

- Backend build and final typecheck pass; shared packages build in registered stage.
- Web typecheck passes. Metadata/proposal UI21tests, worker6tests, semantic JSONB dirty comparison5tests pass; unchanged evidence reused after backend-only deltas.
- Fixture9tests pass for exact compact-source decoding, quotes/backslashes, forged marker rejection, host-prefetched targets and catalog selection.
- Corrected guarded smoke11tests pass, including workspace startup order/frozen branch identity and rejection of legacy/null-metadata output.
- Critical registry23tests pass, including74retained suites partition, exact new primary browser selection, occupied-port safety and mandatory pending/copy/source regressions.
- Whole changed TypeScript/TSX/MJS ESLint, scoped formatting and `git diff --check` pass.
- `pnpm docs:user-flows:check` and mappings for knowledge-workspace, interactive-workbooks, contextual-language-assistant-and-knowledge pass. Knowledge/workbook verified dates updated after their mapped runtime evidence; unrelated contextual baseline date retained.

A separate full workspace regression/web production build was not selected: affected runtime is covered by real Next/browser compilation, web typecheck/unit checks and backend production bundle; no frontend runtime dependency/build configuration changed.

## E-5 — Local readiness

Baselinedoctor failed sandbox inspection; elevated read-only inspection reached the explicit loopback development database and reported two pending migrations. Only tested additive migrations0162/0163 and follow-up0164 were applied there after strict host/database checks.

Final `pnpm dev:doctor --capability knowledge-actions --json`: **ready=true**, migrations match, routing/model/credential/prices/tariffs/budgets/capability/worker/circuit checks pass. Aged unchanged active flow check still allows dispatch; no routing publication or budget/provider change performed.

## E-6 — Real-provider checks: limited evidence, no changed-route claim

Standing guarded account/route and permanent journal retained; no credentials, prompts or answers recorded here.

1. Task `intent-aware-learning-content`, first action: ordinary learner flow succeeded, response/billing persisted, operator expense249microUSD and no customer debit. Post-check showed workspace scope but no blockTarget/working branch, classificationnull: **legacy path only**, not proof of the new route.
2. Corrected smoke startup initializes/selects the owned preferred workspace branch, submits its frozen id/version, and requires completed learning-explanation metadata. Unit/source review approved unchanged one-turn/origin/allowance/journal guards. Second action terminal check: `workspace-routing-unverified`; journal-bound read confirms blockTarget=true but classificationnull.

Read-only process inspection: existing local worker processes started2026-11-01 and have no watch flag, predating thisNov4implementation. They were not stopped/restarted because they are user-owned. This explains the stale-runtime evidence; it does **not** prove current changed-route provider behavior. Both task slots are used, including the retained unknown/reserved slot; no automatic retry, journal reset, new task key or further paid dispatch. Synthetic note/chat/turn/billing artifacts retained per policy.

**Residual gap:** current-code real-provider routing/authoring and broad multilingual quality evaluation are unproven. Restart the existing local worker before manual use. Independent completion review explicitly permits technical completion with this optional-layer limitation documented separately from implementation/readiness.

## E-7 — Review and scope

Independent full source review plus bounded remediation approval; security review of worker functions/grants/tools/projections and final publication gates found no unresolved material issue. See REVIEW for dispositions. Runnable Playground and cross-context artifacts remain deferred as user selected; full backlog items remain In progress. Recent same-chat proposal catalog is bounded to8; older/ambiguous sources ask clarification.

## Final source identity

Base: `535e781`. Final69-file code/test/SQL manifest SHA256: `fb126a4e316ceadc2fae1af0dc65772f10e9f273bbbadbaa0e0bafc584c5592f` (manifest at `/tmp/feature060-final-codehashes.json`). Generated temporary Next environment declarations excluded; their canonical tracked content is restored and clean. Docs/records are checked separately. No handwritten code changed after final selected gates except the reviewed internal smoke startup/guard, independently covered by11guard tests.
