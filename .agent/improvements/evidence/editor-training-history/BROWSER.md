# Editor actions and practice history browser evidence

Verified 2026-10-08 using project-pinned Playwright 1.62.1, Chromium, the maintained web E2E harness, real Next.js/Hono applications, and disposable PostgreSQL/Redis. No paid model service or development database was used. Source-based Magic Patterns fidelity is supported by the frozen Menu/Launcher source and rendered runtime captures; no reference screenshot pixel comparison is claimed.

## Final acceptance evidence

- Owner secondary actions: Sentences, My practice history, bulk heading, pasted terms/document/import, separator, export/sharing; every action has a decorative icon, two separators, and keyboard focus remains on actionable controls. Wide and 390 × 844 menus fit the viewport.
- Train contains exactly Cards and Sentence practice, including the mobile launcher. Saved sentences are reached through secondary actions.
- Standalone Flashcards history shows persisted Known/Practise again/Unstudied totals. The owner journey rates and undoes a card, rates it again, and then verifies 1/0/0 from the real progress API.
- Sentences history shows both translation directions. One real free reference review yields Words practised 1, Manual reviews 1, AI checks 0 for English → Spanish; the reverse direction remains unpractised. Aggregate statistics are independent of history pagination. AI history is empty, while manual history contains the real dated review and retained reference details.
- The statistics transport is deliberately interrupted through its bounded automatic retries. The explicit error and Retry action are observed; removing the interruption and retrying loads the real server result. Loading, populated, and reference-detail mobile states are captured separately.
- Closing owner/shared history restores focus to the actual More dictionary actions trigger. Reopening resets the standalone tab to Flashcards and does not repeat the consumed URL intent. Arrow-key tab navigation and modal focus containment remain functional.
- Signed-in shared readers get a separate two-action secondary menu, preserve the capability fragment through real library navigation/breadcrumb return, and see reusable saved sentences. Their personal history remains empty until their own action; another learner's AI attempt is not exposed. The existing zero-credit free review, private progress, inline history, and live sharing-revocation clearing assertions pass.
- Preview/archive/restore still do not add a review, AI score, or practice exposure; pre/post real progress responses remain equal. Existing example-selection preservation and mobile preview geometry assertions pass.

The maintained browser observers reported no unexpected browser exceptions, console errors, failed transports, or server errors in the passing journeys. Deliberate transport faults, insufficient-credit denial and sharing revocation are separately expected and asserted.

## Exact execution

All commands used these synthetic task-owned settings:

```sh
AUTH_E2E_DATABASE_URL=postgres://languon_test:local_e2e_only@127.0.0.1:55493/languon_editor_history_e2e
AUTH_E2E_REDIS_URL=redis://127.0.0.1:56393
AUTH_E2E_SENTENCE_SERVICES=true
AUTH_E2E_WEB_ORIGIN=http://localhost:33493
AUTH_E2E_BACKEND_ORIGIN=http://localhost:40493
```

Final source, session 18232:

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/sentence-practice.journeys.spec.ts tests/e2e/flashcard-training.journeys.spec.ts --grep 'previews saved hints|checks owner practice|owner configures' --workers=1
```

Owner flashcard and owner library: **2 passed**. Shared journey later failed a direct test-only API assertion because the extra library navigation rotated its initial access token. The harness now observes the same reader's current Authorization from actual UI requests, as the library journey already does. It does not change application authentication, credentials, or privacy assertions. Only this shared case was rerun on the unchanged final production source, session 35071:

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/sentence-practice.journeys.spec.ts --grep 'checks owner practice' --workers=1
```

**1 passed**. Thus all three acceptance journeys pass on the final production patch; no claim is made that one final command had three successes.

Additional proportional regressions passed earlier in session 25272: five-word finite round/saved reentry and RTL/Japanese inline history (plus owner/shared practice, library and flashcards). Preparation hit the real per-owner request limit after this large cohort. Its existing explicit recovery helper was applied without changing prepared-manifest or no-regeneration assertions. Preparation and library then passed together in session 89120: **2/2**. These runs verify unchanged practice/preparation logic; final lifecycle acceptance is established by the final three journeys above.

Traceability: sentence-practice-web, flashcard-training-web and dictionary-platform mapping checks passed; the documentation checker passed **19 guides / 16 checker tests**. Dictionary-platform prose only links to the two practice guides; its authoring/lifecycle assertions were not changed and a full dictionary suite was not warranted.

## Runtime artifacts

Purpose screenshots are in [runtime](./runtime/). Primary captures:

- [Wide secondary menu](./runtime/editor-secondary-actions-wide.png), [mobile secondary menu](./runtime/editor-secondary-actions-mobile.png), [two-item mobile launcher](./runtime/training-launcher-mobile.png).
- [Saved flashcard totals](./runtime/flashcard-saved-history-mobile.png).
- [Wide sentence statistics](./runtime/practice-history-sentences-wide.png), [mobile sentence statistics](./runtime/practice-history-sentences-mobile.png), [manual review details](./runtime/practice-history-review-details-mobile.png).
- [Statistics retry](./runtime/practice-history-statistics-retry.png), [loading state](./runtime/practice-history-sentences-mobile-loading.png).
- [Shared secondary menu](./runtime/shared-secondary-actions-mobile.png), [shared saved library](./runtime/shared-sentence-library-mobile.png).

Only synthetic screenshots were retained. Raw traces, authentication state and raw test logs are excluded.

## Cleanup

The verification created only `languon-editor-history-pg` (postgres:17-alpine, loopback 55493) and `languon-editor-history-redis` (redis:7-alpine, loopback 56393). Both were removed with:

```sh
docker rm -f -v languon-editor-history-pg languon-editor-history-redis
```

Playwright-owned app processes finished; task ports 33493/40493 were confirmed free with scoped `lsof`. One interrupted failing iteration left task-owned children; only its confirmed API/web/deterministic worker PID trees were terminated. No existing development services or data were changed.

## Tested production snapshot

Base: `906fa8f`, uncommitted improvement. SHA-256 values below identify the relevant final runtime sources; the final shared rerun changed only its current-session test header, not these sources.

| Source                                                                                                | SHA-256                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web/src/fsd/shared/ui/dialog/dialog.tsx`                                                        | `729afca908daa2a3321b48a196f2a3c5fb911cbb8650477921b1db91efb8282a` |
| `apps/web/src/fsd/shared/ui/menu/menu.tsx`                                                            | `44f6d49d84c7a6eb1c8a1202e295c618c1528d006fd1190e7609c24b9ef7ff62` |
| `apps/web/src/fsd/shared/ui/menu/types.ts`                                                            | `03e6cb00dc27a932ba2c5b5b26a56417a25716813a8a33fbcbe81c0213e0b5c7` |
| `apps/web/src/fsd/shared/ui/menu/menu-common.module.css`                                              | `0190d4b72cf29b7c3e2fae3007b9b03a8643d2101670f89e02ea8d0fc69c7adf` |
| `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-secondary-actions/editor-secondary-actions.tsx` | `c9800eae8055661f8a0d4cc3e96aaa4b19b1c5174266d5d630a863a64636312a` |
| `apps/web/src/fsd/widgets/dictionary-training/ui/dictionary-training/dictionary-training.tsx`         | `e447a7acd0a88edb7097b88db298d1bfbbc502bbb6b096a65a1f6deb619b4bbc` |
| `apps/web/src/fsd/widgets/dictionary-training/ui/practice-history/practice-history.tsx`               | `b5e1d34730cd95c160bd835bd273487fe6832d9b33a890522a49ad2459001a20` |
| `apps/web/src/fsd/widgets/dictionary-training/ui/sentence-statistics/sentence-statistics.tsx`         | `8565c1043e08993e0b1eb404bcb95913b9fbf2f97108880977b219bdd5c756a9` |
| `apps/web/src/fsd/widgets/dictionary-training/ui/shared-practice-actions/shared-practice-actions.tsx` | `7456346ff8bf9f57769c0d5bbf87d4bcf37c2ae3a21409902ba65fb0fadb382f` |
| `apps/web/src/fsd/widgets/dictionary-training/hooks/use-saved-statistics.ts`                          | `b4b8e083fe90ed0049ce25704f9ec8ab4b679604502a45d274e762a895dbf745` |
