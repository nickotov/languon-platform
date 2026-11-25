# Web quality review follow-up

Status: Complete

Existing-contract improvement on main, base 1e0c6e97. Resolve the prepared launch race, correct CSS ownership and token references, simplify export and workbook composition using their current design, make action priorities readable, measure transcript rendering and improve React/CSS enforcement and skills. No public contract, persistence or new product journey. Rollback by reverting the scoped changes together.

Validation plan: focused Vitest regressions for cancelled launches, styling fixtures, lesson labels and streamed history; pnpm styles:check, pnpm --filter @languon/web typecheck, scoped ESLint and Prettier, skill validation and real browser inspection of changed presentation. Use local deterministic fixtures. Estimated several minutes for focused checks, longer for browser provisioning and hook baseline review. Review changes to async identities, render props and checker false positives before delivery.

## Completed checks and decisions

- Training request identity includes mode and direction, and completion belongs only to the current effect. Deferred-request replacement tests and surrounding practice tests passed (52).
- CSS guard fixtures and component ownership checks passed (40 tests). The style gate accepts domain data such as content-filter, flags unresolved class names and required CSS variables, and flags simple list-row tag selectors. Arbitrary selector semantics and dynamic property access still need human review.
- Existing lesson-run tests cover authorization, budget review, exact failed exercise and generic retry labels in both locales; 57 tests passed across lesson generation and prepared preview. Editor settings now uses one close handler and passes the mutation directly.
- Rules of Hooks errors and dependency warnings apply to web source and tests. The first baseline exposed five test components named as ordinary functions. They now use component names. The baseline included 47 dependency warnings across 40 files; intended store resets and callback lifecycles require individual review. Architecture fixtures and affected web tests passed (10 and 77 respectively).
- Three project skills passed packaging, formatting and repository checks. A fresh read-only decision probe applied explicit classes, parent-owned gaps and measured render work to a workbook list example.
- All 36 guide mappings validated, including workbook-guide and dictionary-platform. No new route, command, schema or permission. No database or provider checks required.

## Rendered results

Public workbook V02 was exercised in a real browser: the duplicate heading was removed and a correct answer produced feedback. Desktop and phone inspection covered the composed export sheet with all three actions and the share-link field at 1280×900 and 375×812. The latter two used the actual components with deterministic story data. The isolated guest app's session refresh returned 403 on the nonstandard dev port; its public exercise remained usable. The document-generation eyebrow rendered at 12px and weight 700. Knowledge error and missing-reference chip colors were checked against declared tokens; their individual error states were not rendered.

Local screenshots (temporary agent-browser artifacts): [phone exercise](/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1795628334133.png), [phone export](/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1795628364787.png), [desktop export](/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1795628379680.png), [phone share field](/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1795628401154.png). The actual sheet and share-field stories can recreate the component states without credentials.

Independent review caught a weakened cross-module utility check. The repaired scanner checks conventionally named class/variant tables, demonstrated with an exported table and consuming module. Remediation review accepted the fix. Dynamic class lookup, unconventionally named cross-file mappings and theme scope still require review.

## Integration checks

Full web TypeScript and the integrated style gate passed after a frozen pnpm install synced the workspace links for the new lint dependency. Root ESLint still reports pre-existing blank-line errors in unrelated admin, backend, contract, E2E and script files. The review did not reformat those surfaces. The prepared URL browser journey reached an interactive narrow practice session using exactly one prepared batch and zero new generation jobs. Verification uses synthetic local data.

Prepared-practice Chromium verification passed in 33.4s, including reload, library launch and downstream fault states. [Prepared narrow session](/private/tmp/languon-prepared-launch-e2e-1e0/sentence-practice.journeys-3a70e--batch-without-regeneration-chromium/prepared-sentence-practice-narrow.png). The separate hook regression changes mode/direction during the pending load, which is distinct from the browser happy path.

Tutor history rows are memoized with stable action callbacks that dispatch to the latest committed handler. For five completed messages and one streaming message, an initial render plus one chunk ran the row component 12 times before and 7 after. The five completed rows now render only on mount in this fixture. Changing optional action availability and invoking a replaced retry callback were separately tested. These are render counts with the real Markdown component, not a user-latency benchmark. The parent still walks the message list.

Final checks: adjacent sentence critical smoke passed (2 Chromium tests, zero skips, 60.6s; report in test-results/critical-flows/7b2d1a9f-2235-437f-97ac-a236a7e52de8/summary.json). The 38 changed code files passed scoped ESLint, the transcript tests passed, and generated Next files returned to their starting state. Root lint remains non-green due to unrelated pre-existing formatting failures. No commit made.
