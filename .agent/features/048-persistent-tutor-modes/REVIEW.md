# Review: Persistent tutor modes and v004 workspace

Status: Complete
Verdict: Pass
Reviewed: 2026-10-20

## Boundary and method

Independent reviewer `/root/v9_review` initially reviewed v004 UI over the already-reviewed v003/pane baseline, then explicitly expanded to feature048 contracts, JSONB preferences/defaults, immutable admitted turns, static mode instructions, real frontend persistence/pending/errors and remediation callers. Base `d44ebca3e26f38f775f0a7df04004653a99bd6fd`; final [102 source/test hashes](verified-source-sha256.json) independently matched with zero mismatches. Prior unrelated historical reviews were not repeated.

## Findings and disposition

All material findings were medium and resolved:

- V9-R1: removed the ineffective workspace Half-width menu, using the supplied layout switch.
- V9-R2/R3: mobile Tutor selection restores Split after persisted Focus; attached Focus has no extra launcher; Close restores focus to the proper stable control.
- V9-R4: actual tutor busy state disables overlapping one-shot editor actions.
- V9-R5: mobile tabs control real labelled tabpanels with stable ids.
- V9-R6/R9: observe available workspace width; inline requires480+340px; use overlay otherwise; expose enabled Split when persisted Chat is unavailable.
- V9-R7: selection toolbar respects visible scroller geometry and updates on scroll/resize/selection.
- V9-R8: AI outline submits once with the complete current snapshot.
- V9-R10: review reveal uses computed mobile/overlay placement, including viewport>=1024 with actual area<820. The initial claim against768–1023 was retracted after tracing the effectiveFolded effect and passing tablet proof.
- MODE-R1: preference/default failures retry their captured PATCH/PUT, not a tutor turn. Scope/revision guards invalidate stale retries after preference/id changes and late results. Pending inputs preserve focus and settings remain open. Settings errors use localized **Retry settings**, while actual provider/Stop errors retain their existing retry behavior.

Detailed source/impact/remediation and source fidelity inventory: [v9 improvement](../../improvements/knowledge-workspace-v9-design.md). No remaining material defect or affected-caller regression was found.

## Verified acceptance and evidence

MODE-1–MODE-4 pass: strict enum/defaulting, owner scoped private persistence, immutable turn mode, trusted static guidance, localized accessible controls, actual defaults and operation-specific retry. Evidence:124 contract tests,39 SDK/worker tests,17 policy tests,2 isolated PostgreSQL tests; final frontend bounded suites include19 settings retry/copy tests and11 inline geometry tests. Reviewer independently reran21 editor/auto-send/context/proposal tests,12 mode/retry tests and19 final-copy tests across appropriate patch states; all passed.

Web/backend/contracts lint, typecheck, styling and builds pass. All10 browser journeys have valid final evidence across documented scoped runs; source hashes and targeted reruns establish affected final paths. Durable source/runtime captures cover desktop/dark/settings/default400px/inline/mobile/tablet. Behavior logs do not substitute for the retained rendered comparisons.

## Security review

Independent `/root/tutor_modes_security`: **Pass**, no material exploitable findings. Mode is a strict enum at API and JSON persistence boundaries, mapped to static server-owned guidance. Authenticated owner checks, defaults isolation and immutable snapshots remain intact. No endpoint, tool, external URL, dependency, permission or schema-table expansion occurred. The completed isolated database tests close the evidence that was still pending during its source review.

## Residual limits

Deterministic tests establish prompt construction and authorization boundaries, not guaranteed provider instruction adherence. Existing prompt-injection resistance is probabilistic; no paid/adversarial provider evaluation was claimed. Browser coverage uses Chromium desktop/mobile/tablet, not a native on-screen keyboard or other engines. Reference prose is Russian and runtime fixtures English; the real application shell and qualified inherited primitive/primary-token differences are documented in the fidelity record. No material unaccepted omission remains within the authorized real-contract scope.
