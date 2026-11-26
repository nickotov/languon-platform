# Knowledge document embed verification

2026-11-26, base `0456c642`, local feature branch. The source and tests accompany
this record. Remote destinations in automated tests use deterministic browser
fixtures. No live third-party playback or remote-host availability was tested.

| Acceptance | Proof |
| --- | --- |
| AC-1 | E1 and picker interaction coverage in E6 |
| AC-2 | E1, E2, E3, E6 |
| AC-3 | E1, E2, E3 |
| AC-4 | E3, E4 |
| AC-5 | E1, E2, E3, E5 and independent security review |

### E1. Canonical document and editor

- Contracts build, contracts/backend/web typechecks and the full contracts test suite passed (437 tests). Strict URL shape, node topology, persisted and proposal writer boundaries, embed-only content and offsets have focused cases. Backend knowledge and proposal tests passed (13).
- Focused web editor selection passed (56 tests). The seven suites cover mapped slash insertion, keyboard access, knowledge learning blocks, editor initialization, document presence, Markdown insertion and embed round-trip including undo, safe clipboard parsing and top-level placement.
- `pnpm --filter @languon/web exec vitest run tests/learning-blocks.test.tsx tests/knowledge-editor-initialization.test.tsx tests/knowledge-embed-rendering.test.tsx tests/knowledge-embed-editor.test.ts` passed 54 tests, including existing YouTube behavior, explicit load, image error links, dialog content and changed-source consent.

### E2. Persistence

The selected `knowledge-store.test.ts` case “round trips headings, rules and external embeds” passed against a dedicated, disposable PostgreSQL 17 database. It covered recovery, publication, revocations, revisions, shared reading and independent copying. Test infrastructure was removed at completion.

### E3. Full-stack browser journey

`pnpm test:e2e:critical -- --flow knowledge-document-embeds` passed the sole mapped scenario without skips or retries. Run `b180a37b-d704-4838-bc4a-9bea1fa67c1d` under `test-results/critical-flows/` contains the summary, report and desktop/mobile screenshots. Duration including dependencies and cleanup was 172 s. Chromium tested 1440×1000 and 390×844 against disposable app services.

The author inserted both blocks, saved, reloaded, viewed the inline image in the editor, and opened learner preview. The test observed zero external fixture requests before activation, rendered a website inside the nested sandbox, checked the image's original dimensions and aspect-fit, measured both dialogs and verified return focus. The first run `9dfc36d6-c315-416b-846d-3532c90ee807` hit the harness console gate on Chromium’s expected script-blocked diagnostic for the exact fixture. The final run allowed that specific diagnostic.

`pnpm docs:user-flows:check`, user-flow E2E checks for the embeds and knowledge workspace guides, and critical registry validation passed. `node --test scripts/critical-flows/registry.test.mjs` passed 25 tests with loopback access.

### E4. Storybook and builds

The production Storybook and web builds passed. The pinned browser checked Website, ExpandedImage and UnavailableImage stories, keyboard dismissal and external fallback. A designer inspected desktop website, narrow mobile image and 375×812 Storybook image captures. The close control, source link and media remained visible. The only missing story resource observed was the local favicon.

### E5. Policy and static checks

`node --test apps/web/tests/api-proxy-config.test.mjs` passed both tests, including checks for wrapper script/style hashes and separate CSPs. Browser checks in E3 exercised the actual headers and nested frames.

Scoped ESLint, Prettier and `git diff --check` passed for feature source. Repository-wide lint also reports pre-existing spacing errors outside the feature, and the web style checker reports the existing workbook list component-folder violation. Those broader checks remain red. The test-specific Next build output was isolated and its generated declaration restored.

### E6. Review follow-up

The real `KnowledgeEditor` picker and dialog suite `apps/web/tests/knowledge-embed-picker.test.tsx` passed all three scenarios. Searching for YouTube opened the Video form; cancelling website insertion preserved the exact caret and text; correcting an invalid image URL inserted at the captured target even after the selection moved. Scoped lint passed. This adds test coverage only, so production and browser evidence above applies unchanged.
