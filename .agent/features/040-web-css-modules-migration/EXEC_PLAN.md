# ExecPlan: Web CSS Modules and token migration

Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-12

## Goal and architecture

Deliver AC-1–AC-5 on feature/web-css-modules-migration, from c3e848e.
Existing web FSD/CSS Modules; Tailwind v3 utilities map existing CSS-variable color
tokens. 80 current CSS files and at least 51 JSX utility consumers found by initial
scoped search; full AST/string audit required. ADRs 0005, 0016, 0017 apply until the
accepted partial successor 0029 records user-approved styling replacement.

## Verification strategy

Web suite, root lint, typecheck, webpack build, Storybook build; CSS/token/utility
guard tests. Real-browser catalog plus maintained theme and representative training
journeys against disposable infrastructure. No SQL/Redis behavior changes or database
verification; disposable services are only journey fixtures. No security review:
no material auth/trust/HTML-rendering policy change. Existing valid test harness:
no separate tester unless guard/harness grows substantially or concurrency remains
unresolved. Independent completion review required after author preflight.

Guide: web-ui-kit; scenario theme-preference-persistence;
apps/web/tests/e2e/ui-kit.journeys.spec.ts; registered web-playwright command.
Additional scoped mapped training tests selected from current guides after inspection.

## Milestones

- [x] M1 — Tokens/reset, approved ADR and governing integration rules (AC-2, AC-4).
- [x] M2 — Convert all markup utility consumers and static presentation (AC-1, AC-3).
- [x] M3 — Tokenize all CSS, remove Tailwind, add guard and synchronize guide (AC-1, AC-2, AC-5).
- [x] M4 — Full affected verification, author preflight, independent review/remediation (AC-3, AC-5).
- [x] M5 — Complete records and verified delivery; local feature commit and required squash integration follow this record.

## Progress and assignments

2026-10-12: Clean main inspected; feature branch and four artifacts initialized.
Root owns specification, ADR/skills/docs, dependency removal and integration.
Bounded workers own foundation/reset/guard; flashcard-training markup/styles;
sentence-training markup/styles; remaining utility consumers respectively.
New CSS token substitution follows all markup edits to avoid overlapping writes.
Implementation complete: native reset, canonical geometry aliases, 147 CSS-file
audit, markup/story conversion, dependency removal and guard. Author preflight:
521 tests, lint/typecheck, application/catalog builds, five unique real-browser
critical scenarios and focused visual observations pass (E-1–E-5).
Separate tester was triggered by substantial new guard/tokenizer harness; initial
medium bypass findings and low fixture gap repaired, remediation PASS. Independent
completion review css_final_review passed after two medium findings were repaired.
Repairs cover the Storybook wrapper/guard scan and remaining shorthand/custom
geometry token families. Focused 16 tests, full 521 tests, both builds and five
critical browser journeys reran successfully; final 228-file manifest verified.
Task services cleaned up. Local feature commit and squash integration are the
final mechanical delivery actions; no branch deletion or push authorized.

## Decisions

D-1: Numeric token suffixes denote reference CSS px at root16; store lengths in rem.
Use size for dimensions, space aliases for margins/padding/gaps, radius scale plus
semantic aliases. Preserve irregular values instead of silent rounding.
D-2: Keep global reset declarations explicit when Tailwind goes; classes alone are
insufficient due to Preflight font/border/list/button defaults.
D-3: Runtime transform/progress values remain inline; static styles move to modules.
D-4: Partial ADR replacement is user approved; preserve ADR-0017 build decision.

## Validation and remaining work

Acceptance proof: [EVIDENCE.md](EVIDENCE.md). Review: [REVIEW.md](REVIEW.md).
All acceptance criteria and verification complete. Independent review: Pass after
remediation, no open material findings. Browser coverage is representative rather
than exhaustive; static guard cannot prove arbitrary dynamically generated classes.
No pending implementation or verification work remains.
