# Improvement: Reliable sentence-check validation

Status: Complete
Created: 2026-10-06
Updated: 2026-10-06

Related backlog: [BL-004](../../docs/backlog/004-ai-sentence-translation-practice-done.md); existing Done disposition is preserved.

## Routing and authority

User explicitly requested the recommended fix after read-only diagnosis. Focused reliability improvement to the established checker/provider/worker seam; no new journey, HTTP contract, schema/migration, dependency, auth policy, pricing/retry policy, rollout or architectural commitment. Preserve prior dirty Feature038/maintenance work and its unresolved Git scope; no commit/merge authority. Apply improvement-development, testing, diagnosing-bugs, and independent code/security review for strict model validation and privacy-safe diagnostics.

## Findings and decisions

The local failed check had two grading targets/four hints and reported usage within bounds. Provider parsing succeeded, then domain rejected target inventory or answer spans; the old combined reason cannot distinguish them retrospectively. Do not record IDs, answers, prompts, reference text or provider payloads. Do not rerun paid AI or mutate local learner data.

Provider-only targets become a strict required object keyed by local aliases; project back to the existing ordered UUID assessment array. Provider issues return exact quote/null instead of offsets; compute only unique exact grapheme-aligned occurrences in the unchanged answer, otherwise keep issue with span:null. Domain still rejects malformed grading and forged spans, and keeps existing score caps. Internal allowlisted failure reasons are observed without raw content; instrumentation failures must not interfere with settlement. Invalid check retry remains terminal as before.

## Acceptance and plan

- AC1: complete/unique admitted targets required by provider schema; missing/extra/duplicate-target output cannot fabricate grades.
- AC2: exact Unicode-safe offsets computed by backend; ambiguous/unmatched quotes remain unhighlighted, feedback and scoring preserved.
- AC3: distinguish target/schema/span/bound/usage failures in allowlisted internal diagnostics only; no public DTO, persisted data or retry/accounting change.
- AC4: deterministic provider/domain/worker regressions, affected lint/types/build, mapped guide traceability and one real practice-check journey establish verification; independent review passes.

- [x] Regression tests and scoped implementation.
- [x] Author checks and guide/backlog links.
- [x] Required real-browser practice/check proof.
- [x] Independent review/remediation and final evidence.

## Scope and verification

Affected provider, sentence-feedback/errors, worker dependency/composition logging, local check prompt, focused tests, existing backend guide and mapped marker. No database implementation change: new disposable persistence tests not needed; runtime journey may use owned disposable fixtures. Related accepted ADR0021/0022/0026 remain constraints. Rollback is reverting this scoped patch; public saved feedback and queued job inputs remain compatible.

Pre-edit baseline snapshot: /private/tmp/languon-sentence-check-baseline-ibgnb9eq/manifest.json (hashes and copies of affected paths; excludes raw user data). Git base e8886612981bcc9e4bd3cd4e73a35e2c4ccd435a plus prior uncommitted changes. Reviewer must assess only diff against this baseline.

## Evidence and review — 2026-10-06

- 71 deterministic tests pass across sentence-ai-provider, sentence-domain and sentence-worker-service. Coverage includes complete keyed assessments, quotes with accents/decomposed characters/emoji, ambiguous and invalid grapheme matches, unchanged score caps, bounded usage settlement, returned and thrown SDK schema failures, unknown transport failures, and failing diagnostic observers. The initial regression run demonstrated three failures before implementation.
- Five prompt tests, prompt lint/typecheck/build passed. Final affected production/test lint, backend typecheck and backend ESM/DTS build passed.
- Documentation checks passed for 19 guides and the sentence-practice-backend mapping.
- Real Chromium owner/reader practice journey passed (1/1, 24.3 seconds), including AI feedback rendering and console/request assertions. The mapped backend journey passed (1/1, 5 seconds). Both used owned disposable PostgreSQL/Redis and deterministic providers. Evidence: [browser manifest](evidence/sentence-check-validation/browser/manifest.json) and screenshot checksums beside it. Containers/listeners were removed; Next declarations were restored through the supported generator.

Independent review against the 13-path pre-edit baseline found two issues:

- SCV-R1 (High): strict schema rejection lost already reported usage, causing conservative reservation settlement. Fixed by validating bounded usage first and passing it through a typed private provider error to the worker. The installed SDK can also throw AI_NoObjectGeneratedError; a narrow name guard handles only this validation error and reads only bounded usage. Unknown exceptions retain prior handling. Invalid usage remains conservative. Native and returned schema-failure regressions pass.
- SCV-R2 (Medium): raw substring ambiguity was checked before grapheme alignment. Fixed by enumerating exact occurrences and retaining the sole grapheme-aligned match. Multiple valid matches remain unhighlighted; regressions pass.

The SDK receives its supported noop logger to prevent raw validation payload logging. The worker reports only operation kind and an allowlisted reason. Synchronous or asynchronous observation failures cannot interrupt credit settlement. Independent remediation/security-focused review passed with no remaining material findings. The reviewer examined the 13-path baseline delta, settlement/retry/cancellation callers, and the installed Mastra implementation. SCV-R1 and SCV-R2 are resolved. Canonical browser/backend evidence remains valid for the unchanged public success path.

Scoped commands: `pnpm --filter @languon/backend exec vitest run tests/unit/modules/learning/infrastructure/sentence-ai-provider.test.ts tests/unit/modules/learning/application/sentence-worker-service.test.ts tests/unit/modules/learning/sentence-domain.test.ts`; `pnpm --filter @languon/backend typecheck`; `pnpm --filter @languon/backend build`; ESLint on the affected production/test files; `pnpm docs:user-flows:check`; `pnpm user-flow:e2e -- check sentence-practice-backend`. Runtime commands and limitations are recorded in the linked manifest.

## Remaining risks and handoff

Runtime fixtures return canonical drafts; private provider wire validation is covered separately by deterministic adapter tests. No paid model call was made, so this evidence does not establish live-model linguistic quality. Existing invalid output can still fail safely; no score is invented. The original failed job cannot be retroactively diagnosed more precisely and remains failed. Restart the worker and submit a new explicit check to use the revised prompt/schema; no new environment setting is needed.

SDK classification and logger suppression rely on the installed Mastra error name and supported primitive registration hook; dependency upgrades must reverify these assumptions.

Prior Feature038 work and its Git-scope blocker remain separate. The subsequent user request “commit” authorizes the combined local commit described in Feature038. No merge or push is performed by this commit-only action. Reverting the scoped patch restores prior behavior; existing saved feedback and queued input contracts remain compatible.
