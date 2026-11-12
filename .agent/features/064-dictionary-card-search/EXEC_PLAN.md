# Execution plan: Reliable dictionary card search

Status: Complete

## Goal and specification

Implement [FEATURE.md](FEATURE.md) AC1–AC7. User approved migration scope after
read-only discovery. Keep main untouched during implementation; normal authorized
feature completion/local Git policy applies after evidence/review.

## Existing architecture and diagnosis

EditorToolbar updates raw state.search. useEditorState uses it directly in cards
query keys, so every character starts a query. DictionaryEditor returns an entire
LoadingState when cards.data is absent, unmounting toolbar/input. Existing backend
listCards uses websearch_to_tsquery with whole lexemes and a four-field GIN document
(source,translation,definition,example), so prefixes and translated examples fail.
Queries already bind dictionary/lifecycle and use50+1default cursor pagination;
readOwnedState takes a shared dictionary lock before reading settings/cards.

Use frontend-development/ui-ux-composition existing-pattern direction, testing,
db-verification/browser-verification/user-flow-e2e and code-review. ADR0002/0011
bind migrations and queries. Semantic LSP is unavailable; scoped rg/caller reads
and real SQL plans establish affected behavior.

## Ownership and milestones

Root owns backend query/schema/generated migrations, feature artifacts, guide and
E2E mapping/integration, infra/build ownership and final independent review.
Frontend worker owns only dictionary-editor widget and focused web search tests.
Separate DB tester owns only a new repository search integration file and plan
observations; no schema/production query edits. Workers are not alone and must
preserve each other's changes; no overlapping files, Git or broad compilation.

- [x] M1 — Reproduce focus/debounce failure; frontend AC1/AC3/AC4 correction.
- [x] M2 — Prefix query + exact index/migration; AC2/AC4/AC5.
- [x] M3 — Disposable DB correctness/performance; AC2/AC4/AC5/AC6.
- [x] M4 — Focused real browser search + guide mappings; AC1/AC3/AC7.
- [x] M5 — Independent source/security review, remediation, selected final gates.
- [x] M6 — Final evidence/doc/Git delivery per root feature policy.

## Pre-implementation verification strategy

- Web focused dictionary-card-search.test.tsx reproduces genuine input unmount
  against original code, then proves stable focus/caret, one request per idle
  interval/latest term, pending/failed result handling and page reset. Real
  controller/TanStack Query, mocked external HTTP API only (~3–10s).
- Backend new drizzle-dictionary-search.test.ts uses existing guarded disposable
  DB helpers/real store; field/prefix/Unicode/literal punctuation/lifecycle/owner
  and cursor tests plus10k-card/multi-dictionary plans. One cold setup (~10–30s),
  bounded queries (~1–20s). No normal developer data reset.
- Existing repository indexed-search case and index-integrity assertion if its
  expected index identity changes; do not run unrelated generation/accounting
  matrices. Existing migration runner applied to clean schema and index change
  on representative existing rows, rerun idempotency. Keep actual migration hash
  integrity; never hand-edit generated SQL/metadata.
- Generate migration with pnpm db:generate after declarative schema edit;
  pnpm db:check plus review exact SQL/index definition. No extensions/dependencies.
- Scoped ESLint/Prettier, web/backend types, styles contract (~10–60s). No full
  monorepo suite, catalog rebuild or AI smoke/doctor required: no AI seam changed.
- Actual browser existing dictionary-platform fixture, one stable search scenario
  using synthetic local account/cards, no generation. Type continuously without
  re-clicking, verify debounced requests and all five fields including card beyond
  first page; clear/no-match and responsiveness. Existing Playwright owns the
  repeatable journey, do not add a separate harness. Estimate30–90s setup/body.
  Refined before browser implementation: DB tests prove matches beyond the loaded
  page, and the real controller test proves pagination reset. Use one full-field
  card in the browser and assert actual HTTP result IDs; fifty filler writes
  would duplicate lower-layer proof without testing a distinct boundary.
- docs:user-flows:check + user-flow:e2e check dictionary-platform after guide and
  stable marker update. Include feature slug in related_features/source_paths;
  existing guide owns journey, no duplicate new guide.
- Initial focused author preflight → independent completion source review and
  complementary SQL/security review → only affected final gates/evidence approval.
  Separate DB tester is justified by query-plan/load and index verification;
  reviewers reuse its evidence, not duplicate full suites.

## Progress, uncertainties and rollback

Initial root causes are source-confirmed; selected regressions will prove them.
SQL prefix lexeme construction must be parameterized and tested with actual PG;
input length bounded by existing contract. Benchmark plans determine whether
small/common prefixes stay efficient through GIN and dictionary ordering indexes.
No new minimum query length without a demonstrated need/user contract decision.
Index migration changes physical lookup only, no card content. Roll back via
forward recreation of the original index/query if needed; schema/history remains
append-only and generated. Do not alter old migrations or add compatibility readers.

2026-11-12 progress: frontend, disposable database and mapped real-browser gates
pass. Local index migration applied safely; scoped static/docs gates pass.
See E1–E5 in EVIDENCE. Independent SQL/security review found no material issue;
completion reviewer approved final source/evidence after both findings were
resolved. All AC1–AC7 have valid selected proof. Local feature Git delivery uses
the root squash policy; no push or branch deletion. No changes to AI, auth,
public contracts, billing or worker execution. User-acceptance retrospective
remains pending user acceptance and does not block technical completion.
