# Evidence: Interactive knowledge workbooks

Status: Foundational checks recorded; feature verification incomplete

## Tested state

Branch: `feature/interactive-workbooks`. Results below were supplied by the
implementing agents/main coordinator on 2026-10-28; this document writer did not
rerun them. Command transcripts are consolidated below; E2 invocation is still pending.

Learning-block source SHA-256:
`b31582d95187d40443dbe514f3afca23d5860b7eb23e5601821d7b97c7df7640`.
Learning-block test SHA-256:
`7343a16c943be12db7dbf8d8a1d555f2ab2be087b413c6f333d88cd5b95acaf7`.

## Acceptance mapping

| Acceptance | Implementation | Proof | Status |
| --- | --- | --- | --- |
| AC-1, AC-20 | Standalone learning-block schemas, tests and public export | E1, E2, E4 | Partial contract foundation only |
| AC-3, AC-21 | Legacy whole-note proposal parser frozen to version 1 | E3 | Partial writer boundary only |
| AC-2, AC-4–AC-19, AC-22 | Runtime journeys pending | Pending | Not verified |

M1 remains incomplete: no version-2 runtime document integration, UI or database
implementation is evidenced here. Contract validation is not browser XSS proof.

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
  Backend typecheck is pending and no result is claimed.
- E4 — Contracts build with the public learning-blocks export completed with
  exit code 0, as reported by coordinator:
  `pnpm --filter @languon/contracts build`. Runtime integration is not implied.
- E5 — `git diff --check`: passed after specification/backlog synchronization.
  This is documentation hygiene, not runtime acceptance evidence.

## Required evidence

Remaining contract/security regressions; real DB migration/transaction/lifecycle
checks; production-composition AI budgets/cancellation/settlement; reusable block
browser journeys and mobile/RTL/accessibility states; affected static/build
checks; guide revision/mapped E2E validation; full critical gate; independent
review and final security/evidence approval. Record exact commands, tested state,
environment, result and limitations when executed.

## Limitations

Transcription provider readiness and media lifecycle remain unverified. No claim
of end-to-end XSS prevention, privacy enforcement or independent-copy survival is
made yet. Existing legacy proposal targeting of future version-2 notes still
needs an explicit guard before version-2 runtime integration.
