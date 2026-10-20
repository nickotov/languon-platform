# Evidence: Persistent tutor modes

Status: Complete

The tested code is identified by [final source hashes](verified-source-sha256.json) over base `d44ebca3e26f38f775f0a7df04004653a99bd6fd`. Historical v003/pane evidence remains separate. Backend, frontend and final real-browser behavior checks below cover MODE-1–MODE-4; v004 visual evidence is retained with the design handoff.

## Backend and contracts — 2026-10-20

Implemented MODE-1/2 through existing JSONB preference boundaries. Conversations/defaults/claimed turns parse the canonical schema, defaulting absent mode to Auto without rewriting immutable historical admissions. New writes normalize preferences. User ownership checks, saved defaults, turn admission snapshots and existing tool/model limits remain in place. Runner guidance comes from a static map keyed by the validated mode and explicitly retains tutor scope, uncertainty and untrusted-context rules.

Verified:

- `pnpm --filter @languon/contracts build` — pass.
- `pnpm --filter @languon/contracts exec vitest run` — 13 files, 124 tests pass. Corrected an existing 40,000 non-BMP reference fixture to supply its already-required empty editor anchor/hash; exact allowance assertion retained.
- `pnpm --filter @languon/contracts typecheck` — pass.
- `pnpm --filter @languon/backend exec vitest run src/modules/conversations/infrastructure/ai/contextual-tutor-runner.test.ts tests/unit/modules/conversations/conversation-worker-service.test.ts tests/unit/modules/conversations/conversation-stream-polling.test.ts` — 3 files, 39 tests pass, including four mode prompts through the real pinned SDK and deterministic injected provider; no paid calls.
- `pnpm --filter @languon/backend exec vitest run tests/unit/mastra/development-server-policy.test.ts` — 17 tests pass. Existing canonical agent registration/tools/policy remain unchanged; no additional primitive or Studio permission was created.
- `pnpm --filter @languon/backend typecheck` and `pnpm --filter @languon/backend build` — pass. Build emits the existing unused dictionary document-import warning unrelated to modes.
- Affected nine contract/backend TypeScript files: `pnpm exec eslint <affected files>` — pass.
- Guarded isolated database invocation: `ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=<loopback disposable URL> AUTH_TEST_DATABASE_CONFIRM=languon_auth_modes_test pnpm --filter @languon/backend exec vitest run tests/integration/modules/conversations/conversation-store.test.ts -t 'persists independent owner defaults|normalizes missing modes'` — 2 pass, 31 unrelated cases skipped.

Database target: dedicated `languon_auth_modes_test` on local container PostgreSQL port 55444, separate from the browser fixture DB. Test support explicitly resets only that dedicated database and applies the existing forward migration chain. No schema change/new migration exists, so no new down migration or rollback applies. Tests verify default isolation between owners, preference recovery, independent existing conversation mode, immutable admitted-turn mode after a conversation changes, rejection of another owner's update, and normalization of pre-mode stored JSON. Historical fixtures are inserted through the required capacity transaction; production immutability triggers stay enabled. Initial test-fixture attempts correctly rejected immutable updates and missing mandatory fields; the final passing fixture inserts a complete historical turn/message without disabling guards.

No Redis semantics changed; Redis verification is not required for this slice. Browser/default persistence checks are recorded below. Independent completion and security reviews pass; local integration is the final workflow step.

## Frontend and combined runtime — 2026-10-20

- Full affected web lint, typecheck and CSS/token guard passed: `pnpm --filter @languon/web lint`, `typecheck`, `styles:check`.
- Focused editor/tutor integration check passed43 tests in11files before the final bounded settings retry/copy remediation; the affected final widget surface subsequently passed35 tests in9files and19 tests in3files for final copy. The final inline geometry tests passed11 tests. Exact focused selections are recorded in the v9 improvement; backend and source hashes remain unchanged across final validation.
- `pnpm --filter @languon/web build` passed optimized compilation, TypeScript and all16 static route generations. Its generated next-env content was restored to its original bytes. Backend/contracts build results are above.
- Guarded real-browser command uses `pnpm test:e2e:contextual-assistant` with exclusive local PostgreSQL55444 (`languon_auth_assistant_web_test`) and Redis56444/1, explicit disposable confirmations, synthetic users and deterministic assistant. Every invocation's HTTP preflight passed4/4. No paid provider used.
- Final functional evidence spans all10 existing mapped browser scenarios: initial final run8passed/2failed (never called wholly green), scoped run passed legacy Stop/Retry and the final440px inline proposal/1024px overlay case, then final settings run passed both remaining mode-settings and document-layout scenarios. The source preference scenario verifies Practice→refresh, independent existing chats, saved defaults→new chat, Explain changes only its chat, actual turn preference snapshot, intentional503 PATCH/PUT failures, truthful Retry settings, same-method/payload retry and zero extra turn POSTs. Earlier stale async/native-radio assertions were corrected without weakening confirmed server-state or popup focus assertions.
- Browser regressions also cover desktop/tablet/mobile layout transitions, actual available area480px minimum inline document, Focus/Chat persistence, labelled mobile tabpanels, full-snapshot AI outline sent once, scrolling selection actions, guarded inline/full review, mapped target edits/Undo, copied reference allowance, private recovery/conflicts and saved-only sharing/copy.
- Browser assertions inspect page/console errors and server failures; only deliberately injected503 responses are allowed by an exact test header/path/method. Expected fixture Stop cancellation is not an unexpected application failure.
- Source/reference/runtime manifests and captures: [v004 reference](../047-knowledge-workspace/designs/knowledge-workspace-detail/v004/reference/captures.json), [runtime directory](../047-knowledge-workspace/designs/knowledge-workspace-detail/v004/runtime/). A post-build bounded draft capture rerun retains the required desktop/default/settings/dark images after build cleanup removed the earlier transient Playwright output; no app source changed and existing functional evidence remains valid.

## Security and evidence validity

Independent `/root/tutor_modes_security` verdict Pass: strict validated mode enum maps to static trusted guidance, no new tools/permissions, authenticated owner checks and immutable snapshot boundaries unchanged. Source/editor contents remain untrusted; existing model resistance is probabilistic and deterministic tests establish prompt structure, not provider quality. The isolated DB evidence above completed after the security source review and closes its pending infrastructure evidence.

Independent `/root/v9_review` reviewed v004 UI and expanded to mode contracts/persistence/instructions/settings. Material UI and operation-specific retry findings have been remediated and independently rechecked; final expanded completion verdict is Pass. A separate new test harness/tester was not needed: existing deterministic repository/HTTP/browser harnesses were extended, with independent review of validity and bounded browser verification by a worker separate from the authors.

No application source changed after the final hash capture; documentation-only completion updates do not invalidate checks. No migrations, external writes, deployment, push or branch deletion are part of delivery.

## Final handoff evidence

Durable [results.json](../047-knowledge-workspace/designs/knowledge-workspace-detail/v004/runtime/results.json) and [captures.json](../047-knowledge-workspace/designs/knowledge-workspace-detail/v004/runtime/captures.json) retain all18 runtime/10 reference screenshot identities, qualified source comparisons and per-scenario valid execution. Final post-build capture run passed1 browser/4 HTTP tests without source changes. The main agent inspected saved/default, settings, mobile and final440px inline rendering. Independent completion verdict is [Pass](REVIEW.md), all102 source/test fingerprints match and `git diff --check` is clean. Final guide revisions/mappings and documentation checks pass. No application verification work remains; local feature integration preserves this tested content.

Local integration: feature implementation commit `13b6206`, squash applied to main without conflicts. Final documentation-only completion changes do not alter any102 verified runtime/test hashes. Source tree and staged diff checks remain clean; final local main commit records this evidence. No push/deployment performed.
