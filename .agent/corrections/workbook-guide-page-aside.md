# Workbook guide page-level aside

Status: Complete
Created: 2026-11-15

## Scope and routing

Bounded correction to the approved guide layout, from main 42ca732f. Place the
desktop ActivitySelector alongside the complete content column, including the
hero and ExerciseExplorer; cap its scrollport at 70vh. Keep mobile docking and
all exercise behavior. No API, persistence, dependency or product journey changes.
Existing tokens/CSS Modules and server-to-client composition apply.

## Acceptance and plan

- [x] Selector is a sibling of the header/exercise column, aligned with hero.
- [x] Desktop aside is sticky, scrollable and at most 70vh; deep-linked selection
      is revealed. Mobile selector remains fixed at the bottom.
- [x] Preserve reset/check/URL behavior and document the layout in the guide.

Before edits: select focused guide unit tests, scoped ESLint/format/style checks,
web typecheck, mapped three-journey browser suite with alignment/height assertions
(minutes, disposable local infrastructure). No full backend/DB/AI regression: none
of those paths change. Source review is proportional author review for a local
layout correction; existing design direction is explicitly corrected by the user.

## Evidence

Implemented page-level WorkbookExercisesLayout: selector and content column are
siblings; server-rendered header/footer are composed around ExerciseExplorer.
Selection/URL/reveal handling moves to layout, and exercise remount on selection
clears local responses. Existing reset/check/feedback semantics remain.

- Focused guide Vitest: 3/3 pass. Tests re-query the currently mounted demo after
  exercise switches rather than retaining a detached element.
- Scoped ESLint, Prettier, styling contract and diff checks pass.
- Web typecheck and production build pass. Generated Next.js declarations
  restored after verification.
- User-flow guide updated; mapping and repository guide validation pass (36 guides).
- Guarded browser run `959e7e32-7b84-4d9b-b31e-36f1defb6d34`: 3/3 pass,
  no skips (14.8s). Existing tests retain URL/reset/local-check/no-write guards,
  390/768px mobile light/dark checks, short desktop direct W01 and header clearance.
  Added hero/aside top alignment and <=70vh bounding-box assertions.
- Visually inspected short desktop W01 screenshot: hero and exercise occupy the
  left column; right scrollable selector reaches the selected W01 and is capped
  at 70vh. Artifacts in `test-results/critical-flows/959e7e32-7b84-4d9b-b31e-36f1defb6d34/`.
- Initial browser run exposed React key warnings from server-rendered slots;
  explicit header/footer keys resolve these. Final browser run has no such warning
  and no unexpected mutations or uncaught errors. The guard was retained unchanged.
- Author source review confirms responsive grid ownership moved from explorer to
  page layout, mobile docking CSS is preserved, and selected-item reveal remains
  scoped to the aside. No new domain/security boundary; independent review and
  full suites are not required for this correction.

No known material remaining risks. Rollback: revert this scoped correction. Prior instruction to commit each
stage authorizes a local commit after verification. No push.
