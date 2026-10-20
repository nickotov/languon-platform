# Execution plan: Knowledge Markdown insertion

## Goal / specification

Fix literal Markdown transfers under [FEATURE.md](FEATURE.md), MD-1–MD-4.

## Existing architecture

knowledge-notes editor handle currently splits lines into plain paragraphs; persisted Zod JSON contract allows H2/H3, lists/quotes/tables and common marks. Official package 3.32.0 matches installed Tiptap. ADR-0042 governs tracked target/conflict and undo; ADR-0029 styling; no architectural replacement.

## Test strategy

Parser/mapping/unsafe-input unit tests, real editor integration with complete-document atomic validation and undo/targets, existing deterministic Playwright journeys for preview/acceptance/recovery/publication. Web lint/typecheck/build. No DB implementation changes, so no new repository or migration suite; existing journey uses disposable DB/cache. Independent completion plus rendering/security review. Reuse existing harness; no substantial new harness or unresolved infrastructure means no separate tester required.

## User-flow documentation

Update knowledge-workspace existing guide, proposal-target-review scenario and source mapping; inspect contextual-language-assistant guide for affected behavior. Preserve registered contextual-assistant safe runner and stable IDs. Exact mapped specs apps/web/tests/e2e/{knowledge-workspace,contextual-assistant}.journeys.spec.ts. Review command/config before execution; use existing disposable targets only.

## Milestones

- [x] M1 — Mapping adapter + regression tests (MD-1/2).
- [x] M2 — Editor and all proposal accept/preview flows, failure recovery (MD-1–3).
- [x] M3 — Guides, browser/persistence evidence and affected checks (MD-4).
- [x] M4 — Author preflight, independent completion/security review, remediation and local squash integration.

## Progress

2026-10-20 — Inspected current code and survey; created branch from main and installed version-aligned package via existing pnpm store. Prior survey changes retained. Next: implement token preflight, normalized JSON parsing and editor transaction validation.

## Decisions

D1: Keep current schema and explicit unsupported-content fallback; no broad schema extension. D2: Convert at accepted reply boundary; do not rewrite whole documents. D3: Validate candidate transaction before dispatch; normalization after mutation alone is insufficient.

## Discoveries / validation / remaining work

See [EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md). All implementation/check/review milestones remain outstanding. Existing pnpm peer warnings concern Mastra Hono adapter and Storybook TypeScript, unrelated to added package.

2026-10-20 — M1/M2 implemented: version-aligned official MarkdownManager adapter, strict token preflight, explicit mappings/notices, normalized rich preview, format preserved through inline/full/conflict/retarget acceptance. Prospective ProseMirror transaction is validated before live dispatch; closeHistory isolates acceptance from prior and following edits. 63 focused tests across8 files pass; root ESLint and web typecheck pass. Full mapped11-browser journey run underway after a test wait was corrected to await the second reply. Build must run after browser runner ends: both share ignored .next artifact root and parallel cleanup collided.

D4: Table alignment and link tooltip titles normalize with notices; no visible cell/label content is dropped. Ragged tables rejected before upstream parser loss. Literal math preserved as text; no math extension.
D5: Touched editor handle258 lines retains cohesive imperative snapshot/target/preview interface sharing one target map; parser and transaction construction extracted into pure lib modules. WorkspaceProposal318 lines remains the existing review/restore/async acceptance controller, whose closure coordinates request restoration and focus; formatted rendering and copy extracted into the feature. Further controller splitting would duplicate mutable restoration/acceptance state and obscure the original target lifecycle, so threshold exceptions recorded.

Pre-existing styles:check reports10 untokenized lengths in untouched workspace-controls.module.css and companion-layout.module.css; changed styles produce no violations. No opportunistic edits to these controls in this feature.

2026-10-20 — Author preflight complete; final68 focused tests, final production build/typecheck/root lint/docs mapping pass. Final3 relevant browser journeys pass after plugin-added-node hardening. Full suite10/11 with remaining layout failure independently reproduced on starting297aa42 runtime; baseline styles10 violations unchanged. Retained runtime images and source hashes. Next: independent completion/security review and remediate any findings.

2026-10-20 — Independent reviewer caught stale base attribution: actual branch was created from297aa42, a user commit containing only3 CSS adjustments after c3091de. They remain untouched. Baseline reproduction is still valid because restored task-owned runtime paths are identical in both commits, and the297 CSS was retained. Updated diff boundary and evidence; no user changes reverted. Author security regression replaced ambiguous quote-prefix regex with linear scan (68tests pass). Review remains active; latest production and targeted browser checks pending final record.

2026-10-20 — Initial review MD049-R1 addressed with decoded-output visibility checks after token-only assumptions failed existing nested-list tests and entity variants. Parser mapping and real editor suites now78/9 passing. This is a single invariant remediation (empty accepted constructs); no schema/trust surface expanded. Security SR-049-01 regex availability finding resolved with linear scan and adversarial coverage. Current action: completion/remediation verdict, latest build and final Markdown browser recheck, final Git integration.

2026-10-20 — Independent completion PASS with MD049-R1 resolved; independent security PASS with SR-049-01 resolved and final decoded visibility helper confirmed. Final78tests, production build and affected lint pass; latest Markdown browser1/1 + backend4/4 pass, images refreshed. All28 reviewed source hashes match. Implementation verified; next and only remaining action is required local feature commit/squash integration, preserving existing user CSS and retaining branch. No backlog task is implemented/reactivated by this bounded transfer fix; BL-006 workspace delivery remains historical.

2026-10-20 — Complete. Created feature implementation commit ea5280c and locally squash-integrated it onto main from297aa42 with no conflicts. All28 verified source/test/dependency hashes are unchanged; only final delivery status/evidence prose differs from the reviewed feature tree, so no runtime rerun is needed. Both independent reviews pass and all scoped acceptance evidence is valid. Existing baseline CSS/layout failures remain documented and unchanged. No push or branch deletion; feature branch retained. No required implementation or verification work remains.
