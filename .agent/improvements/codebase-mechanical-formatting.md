# Improvement: Codebase-wide mechanical formatting and lint normalization

Status: Complete
Created: 2026-11-01
Updated: 2026-11-01

## Scope and authority

BL-018, explicitly selected by “commit and continue to next task”. BL-012 was
committed as 7863f25; the initial tree was clean. This is an improvement covering
mechanical layout/braces, lint enrollment and supporting verification. No product
behavior, public contract, dependency, schema, model setting or deployment changed.
Current branch; this task is not automatically committed.

## Acceptance and scope coverage

- AC-1: Inventory 3,099 formatter-supported maintained code/config/style/test files,
  including 2,793 JS/TS files. Exclude historical designs/evidence, generated/native
  output, migration output and lockfiles. All 10 captured pricing fixtures remain
  unchanged and are durably excluded in `.prettierignore`.
- AC-2: Preserve pre-change formatting/lint/type/test/build results and apply only
  approved mechanical fixes. Baseline failures are distinguished below.
- AC-3: Normal lint enforces shared braces/spacing across maintained applications,
  packages, infrastructure, tooling and tests. Default persistence limit remains
  500; three exact temporary exceptions have explicit removal work in BL-019.
- AC-4: AST comparison covers all 2,793 JS/TS files. Of 2,112 changed files, five are
  deliberate lint-policy implementation/test changes and one is the independently
  reviewed workbook test precondition fix. The other 2,106 are structurally
  equivalent. The only changed non-JS/TS source is recovery Compose YAML, whose
  parsed values match. All 37 unsupported SQL/shell sources remain byte-identical
  and are explicitly included in BL-019's manual clarity review.
- AC-5: Maintained formatting, lint, types, full serial workspace tests, tooling,
  builds and all 15 selected critical flows have passing evidence. Two unrelated
  baseline repository-wide gate failures remain explicit below.

No semantic clarity refactoring from BL-019 has been performed. Rollback restores
only this task's patch/config against 7863f25 and preserves unrelated work.

## Planned and actual verification

Before mutations, selected serial baseline commands: `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`. Cold duration estimate was 10–20 minutes;
actual delivery took longer due baseline contention, equivalence review and the
full real-database critical selection. Full breadth is justified by code-wide
impact and the explicit user regression request. No paid providers were invoked.

Tester `formatting_test_strategy` verified command safety and equivalent serial
coverage. Avoided overlapping builds, suites and resets. Critical runners owned
labeled disposable PostgreSQL/Redis, synthetic identities and app processes, and
completed cleanup. No user environment, shared database or production service was
changed. Generated Next declarations were preserved/restored byte-for-byte.

Baseline results are in `/tmp/languon-bl018-baseline-results.json` and stage logs.
Lint passed in 15.2s; types 14/14 in 49.13s; builds 9/9 in 112.91s. Root tests first
hit sandbox loopback EPERM; the authorized retry passed tooling but four admin
cases timed out at the unchanged 5,000ms limit under concurrent workspaces. The
same 15 workspace tasks passed serially in 171.264s. No timeout/assertion changes.

Because `pnpm check` short-circuits on known baseline formatting/catalog failures,
executed every constituent gate separately. The root test prelude used all existing
commands, followed by `pnpm exec turbo run test --concurrency=1`, selecting the
identical workspace tasks with different scheduling only. Final command results,
logs and timings are in `/tmp/languon-bl018-final-results.json`.

| Final check                                         | Result                                         |
| --------------------------------------------------- | ---------------------------------------------- |
| Maintained Prettier check                           | 3,099 files, zero failures                     |
| Setup docs, agent skills, styles, user-flow docs    | Pass                                           |
| Root lint                                           | Pass, 22.7s                                    |
| Root typecheck                                      | 14/14, 93.94s                                  |
| All root tooling test groups                        | Pass; readability policy 18/18                 |
| Complete serial workspace tests                     | 15/15 tasks, 240.26s                           |
| Production builds                                   | 9/9, 158.98s                                   |
| Post-calibration web typecheck/scoped lint/Prettier | Pass                                           |
| Workbook traceability                               | Synchronized, revision sha256:a8cfdde30a544410 |
| Critical flow coverage                              | 15 flows, 819 tests, no critical skips/retries |

Workspace counts include backend 1,851 passed/935 prerequisite-gated skipped,
web 1,303 passed, admin 106 passed, plus packages/panel. Six optional backup/deploy
checks also skip in the default tooling suite. These are retained baseline skips,
not hidden passes. The separate real-DB execution-contract selection passes all
68 files/791 cases with no skips. No live-provider or native-device proof is claimed
for this source-equivalent normalization.

## Equivalence and source review

ESLint used only curly, statement-padding and member-spacing fixes. A second
permitted-fix pass addressed spacing newly exposed by Prettier line wrapping.
AST proof preserves operator/child order, optional-chain grouping/flags, lexical
using scopes, directives, BOMs and shebangs. Seven formatter-added grouping cases
are allowed only at complete return values or conditional branches; the optional
chain counterexample `(a?.b).c` versus `a?.b.c` is explicitly rejected.

Independent preflight review caught missing directive comparison, unsafe broad
parenthesis normalization and captured HTML fixture scope. All were corrected
before accepting equivalence. Reviewer `mechanical_equivalence_review` approved
production source and representative auth, transaction, React, CLI/deployment and
panel diffs, plus the five intentional lint-policy files.

Mandatory braces pushed three near-limit persistence files to exact ceilings:
conversation-turn-admission 505, text-content-mutations 502, texts-job-admission 504. Backend instructions explicitly permit documented exact temporary exceptions.
Tests reject one additional line and retain 500 for siblings. Reviewer approved;
BL-019 explicitly owns cohesive extraction and removal. No compression, blanket
exception or production refactoring was used to bypass the size rule.

## Retained browser failure and bounded calibration

Full critical run `9ad7fc3a-71d5-48a0-aa85-d80a1b76563c` passed its first seven flows,
then workbook scenario 3 timed out awaiting a media 200. Its failed summary/trace
remain unchanged. Diagnostic agent `workbook_gate_diagnosis` confirmed the same
asset had returned 200 earlier; the new correct proposal arrived but made no media
request. It lay below the clipped chat viewport with Jump to latest visible.
`useProposalAudio` deliberately loads on IntersectionObserver intersection;
`toBeVisible` does not establish that precondition. Baseline 7863f25 already had
this test assumption and the production observer remains equivalent.

Added only `audioProposal.scrollIntoViewIfNeeded()` and a reason comment before
awaiting the existing response. All status/path/content-type/WAV/blob/duration
assertions and timeouts remain intact. Independent remediation review approved
this as a faithful user action, not weakening. No production behavior changed.

Passing evidence is deliberately separate:

- Initial run above: seven unaffected passing flows, 14 tests. These inputs/source
  did not change; the changed workbook spec is not selected by them.
- Focused run `b795a2ad-adff-4f84-bc84-e391ad100280`: workbook 3/3, no skips/retries,
  84.843s. Previously failing scenario passes in 28.3s, proving the causal repair.
- Remaining run `219d10e8-0017-4785-aa2c-a1c237e8b98d`: seven previously unexecuted
  flows, 802 tests, no skips/retries, 1,002.015s. Includes document formatting, chat,
  insufficient credits, interview, backend contracts, speech and admin MCP.

The union covers all 15 flows/819 tests. It is not a fictitious replacement for the
failed comprehensive report. Mapped guide/scenario/revision markers are unchanged;
inspect/check and docs validation pass. The guide remains draft for its broader
feature scope; this task does not complete feature 059.

## Final integrity and known baseline exceptions

Final audit `/tmp/languon-bl018-final-audit.json` validates 3,100 frozen source/config
paths, unchanged SQL/shell/pricing fixtures/generated Next declaration, and the
15-flow coverage union. Remediated source manifest SHA-256:
`2dc21abd63904b21adaef3c492cadbbf3f4f5280a74981a04cb8b91d301c4436`.
AST report: `/tmp/languon-bl018-ast-report.json`; no unexpected differences.

- Root `format:check` still reports 272 historical `.agent`/documentation paths:
  a strict subset of the original 312, with zero new failures. They are outside
  this maintained-code normalization and were not rewritten or blanket-ignored.
- Dev-panel catalog still reports the same 15 pre-existing stale/unreviewed
  commands. Updating them would enable command authority and is outside formatting.
- Temporary size ceilings and 37 unsupported-language reviews are explicit BL-019
  work. Full-codebase clarity is not claimed by formatter/lint success.

Independent final evidence verdict: **Approved**, reviewer
`mechanical_equivalence_review`, 2026-11-01. Reviewer reconciled all three critical
summaries, source manifest, AST exceptions, scoped checks and retained failures;
no material findings remain. BL-018 is complete and terminal backlog metadata,
filename, evidence link and index are synchronized. BL-019 remains pending.

Final bookkeeping checks pass: all 19 task IDs/statuses/index/evidence targets,
terminal lifecycle for modified tasks, 54 changed-document links, affected
Prettier and diff hygiene. All 3,100 frozen source/config hashes still match.

No current source finding or required scoped execution gate remains unresolved.
The baseline exceptions above prevent claiming a fully green aggregate
`pnpm check`. Completion does not claim whole-codebase semantic clarity, paid
provider execution, native-device proof or completion of unrelated features.

## Subsequent resolution of baseline gate exceptions

The user separately authorized fixing the historical formatter and catalog issues.
[Catalog and formatting maintenance](catalog-and-formatting-maintenance.md) records
their resolution and a passing aggregate `pnpm check`. The original BL-018 results
and failed critical report above remain unchanged; this follow-up does not rewrite
that historical evidence or complete BL-019's semantic clarity work.
