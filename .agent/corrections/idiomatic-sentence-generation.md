# Correction: Idiomatic sentence generation

Status: Complete
Created: 2026-10-05
Updated: 2026-10-05

## Routing and scope

Bounded correction to established sentence quality, explicitly requested after the unnatural Russian/French example. No API, schema, model/provider, dependency, security, billing or persistence change. Preserve earlier local-default and UI work; no commit or merge authorized.

## Acceptance and plan

- [x] Inspect prompt resolution, candidate direction semantics and source/hint validation.
- [x] Require natural language on both sides, semantic equivalence and idiomatic slang without invented foreign borrowing.
- [x] Avoid tautologies, definitions and forced multi-entry combinations; prefer priority-only generation when needed.
- [x] Include the reported negative example and a natural alternative while preserving entry IDs, lexical hints, phrase identity and exact segmentation.
- [x] Build the prompts package; run existing prompt/provider/domain checks; inspect the final diff.

## Context

Production sentence agents use the built checked-in prompt through `getLocalPrompt`, without Langfuse overrides. Reload workers after rebuilding prompts. Newly generated sentences use the update; saved exercises are not rewritten, consistent with saved-first/additive history.

## Verification

Checks passed on 2026-10-05, Node 24, uncommitted prompt patch above main `e888661`:

- `pnpm --filter @languon/prompts test`: 5 tests passed.
- Prompts `build`, `typecheck`, and `lint`: passed. Built exports now contain the updated prompt.
- `pnpm --filter @languon/backend exec vitest run tests/unit/modules/learning/infrastructure/sentence-ai-provider.test.ts tests/unit/modules/learning/domain`: 10 tests passed, including deterministic provider/schema/candidate alias compatibility and existing flashcard projection coverage.
- `pnpm --filter @languon/backend exec vitest run tests/unit/modules/learning/sentence-domain.test.ts`: 9 tests passed, including hint, segmentation and sentence-domain validation.
- Affected Prettier and `git diff --check`: passed. Author preflight confirmed priority inclusion, exact-language direction, entry IDs, phrase preservation, hint privacy, structured-output schema and untrusted-input handling remain constrained. Independent review is not warranted for this bounded prompt-text correction.
- No new implementation-mirroring wording tests. No paid model calls; deterministic checks cannot establish linguistic quality. Rendering evidence reuses the [real Chromium learning-dialog evidence](../improvements/learning-dialog-presentation.md), valid because component code and response contracts are unchanged. No newly generated live model output was observed; linguistic improvement is an explicit probabilistic limitation, not a claimed browser result. No persistence/security behavior changed, so separate database/security review is not required.
- Established user-flow journeys, commands and failure semantics do not change, so revision/backlog updates are not applicable. Related guide: `docs/user-flows/sentence-practice-backend.md`; existing feature 036 remains complete.

## Remaining risks and rollback

Language quality remains probabilistic. Revert only this prompt to roll back; no migration. Saved awkward exercises remain reusable under existing lifecycle behavior; choose new generation to try the updated prompt.
