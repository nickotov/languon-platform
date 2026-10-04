# Model preferences and sentence practice web design integration

Status: Complete
Owner: Root
Created: 2026-10-04

## Authorized outcome and scope

User requested implementation of the two returned designs to finish feature delivery.
Deliver BL-005 profile model preference and BL-004 sentence practice with the verified035/036 backend. No unrelated shell, account, dictionary authoring, billing or demo UI. Existing flashcards remain working. No production enablement, provider calls, new dependency or migration is authorized.

## Acceptance criteria

- AC-1 — Account model preference reads/saves Auto or curated explicit choice, displays real capability/rates/availability, preserves draft on errors and detects optimistic conflicts; no unsupported catalog metadata or credit claims.
- AC-2 — Owner and signed-in shared reader use real setup, both directions, explanation language, eligible all/manual scope and saved-first/new-only/review-only, preserving additive history and personal state.
- AC-3 — Active practice renders exact source/hints, validated free draft, server-owned AI grades/corrections, multiple attempts and replay-safe free explicit reference review independent of credits/model availability.
- AC-4 — Real async job polling/cancellation/reconnect/retry preserves operation IDs and drafts, never duplicates paid work, handles access/version/auth changes without protected stale content.
- AC-5 — Personal AI/manual history, current progress and honest session summary remain separate; cursor pagination and errors preserve already loaded authorized rows.
- AC-6 — Fullscreen/dialog/mobile presentation preserves one session, draft/reference/feedback/job and counters; existing Escape convention, focus restoration and safe leave confirmation apply.
- AC-7 — All required design inventory rows are accounted for with localization, responsive/dark/RTL/keyboard/accessibility evidence; all relevant checks, guides/E2E, independent correctness/security review and remediation pass.

## Supplied-design coverage

The authoritative source inventories remain in [035 FEATURE](../035-user-ai-model-preferences-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04) MP-UI-01–10 and [036 FEATURE](../036-sentence-practice-backend/FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04) SP-UI-01–17. No competing checklist. The user now selects v001/provider v6 in both handoffs for implementation. Their pinned artifacts/exports and earlier contract adaptations remain authoritative. EVIDENCE maps these IDs to runtime proof. The external rendered reference was unavailable. Verify the retained source-derived content, controls, hierarchy and states against actual runtime captures; do not claim pixel equivalence to an unseen reference image.

## Architecture and security constraints

Next client feature slices with app-local shared primitives/tokens (ADRs0016/0017), contracts at remote boundaries, authenticated actor/live share access (ADRs0026/0027), personal content held in actor/target-scoped mounted state, no raw share keys in query persistence/storage, no HTML rendering of generated text. Shared high-level training composition belongs to widgets, not cross-feature imports. Changing model applies only to future requests. Reference contents are fetched only on explicit reveal or own manual history. No mock grading or exact-string verdicts.

## User flows

The sentence-practice-web browser guide maps six verified critical scenarios to apps/web/tests/e2e/sentence-practice.journeys.spec.ts via web-playwright. Existing magic-profile-page, flashcard-training-web and dictionary-platform flows are regression surfaces. Keep backend guide evidence unchanged.

## Remaining decisions

None requiring user input. Use approved design/source contract adaptations. Preserve completed backend records and BL-003's broader unfinished scope.

## Completed delivery — 2026-10-05

AC-1–7 are implemented and verified. See EVIDENCE and REVIEW for all checks,
mandatory inventory dispositions, independent remediation and explicit proof
limitations. BL-004/BL-005 are Done; BL-003 remains In progress for its broader
unfinished scope. Both backend features retain Complete status.
