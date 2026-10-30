# Correction: Stable hover transition to the prose drag handle

Status: Complete
Created: 2026-10-30
Updated: 2026-10-30

## Scope and diagnosis

Bounded correction to the existing drag affordance. The handle sits outside its
editor host with a 4px gap. Host mouseleave and mousemove on editor padding hide
it immediately while a user crosses that gap. Fast tests jumped to the handle
without exercising the transition. Preserve all previous uncommitted work.
Slow browser regression also caught unrelated view updates retargeting the grip
to the unchanged caret's block during the hover. Both causes belong to this fix.
No schemas, APIs, saved content, drag/drop transactions or dependencies change.

## Acceptance and plan

Keep the handle visible across the spatial corridor joining the active prose
block to its handle, including a pause in the gap. Hide it when leaving that
area or entering another block, and retain read-only/stale-document safeguards.
No arbitrary hide delay or timeout race. Remove global listeners on destruction.
Add a focused geometry/event regression and genuine browser pointer movement
with deliberate gutter dwell before native dragging. Run affected checks.

## Verification and review

Focused 13/13 tests pass: corridor through editor padding/external gap to the
handle, leaving the corridor hides it, and unchanged-state view updates preserve
the hovered block instead of selecting the caret block. All prior native slice,
undo/group, keyboard/pointer and read-only cases remain green. Browser passed.
Existing interactive-workbooks guide describes the intended hover/drag
behavior unchanged, so no guide revision is needed. Preserve mapped scenarios.
Independent review not required for this bounded event-lifecycle correction;
author preflight covers bounds, other-block transitions and listener cleanup.
No commit requested.

The first browser run retained a real hover-retargeting failure after gutter
dwell. It also exposed an independent pre-existing strict selector ambiguity in
the library-copy test: the same prepared word appears in the entry list and in
the preview. Scope that assertion to the labelled Preview region, preserving
its prepared-content requirement rather than using an arbitrary first match.

## Final evidence and outcome

- `pnpm --filter @languon/web exec vitest run
  tests/knowledge-prose-block-drag.test.tsx`: 13/13 passed.
- `pnpm test:e2e:critical -- --flow interactive-workbooks`: 3/3 passed, no
  retries/skips, run 71cd70c0-c08f-4da3-bfb5-00df30cb1aab. Real Chromium with
  disposable PostgreSQL/Redis and deterministic providers, no paid calls or user
  data/process changes. Existing journey checks cover console/page/server errors.
  Paragraph and heading drags each cross the gutter in intermediate mouse steps,
  pause 600ms in the gap and 300ms on the handle, then perform real native dragging
  and assert final order. Those delays deliberately verify dwell stability and
  are not application-readiness waits. Keyboard/mobile/group/publication/library
  journeys still pass. Runner cleanup restored generated Next declarations.
- Web typecheck, scoped ESLint, Prettier, mapped guide check and diff hygiene
  passed. No CSS or persistence/AI/drop logic changed, so broad builds, DB review,
  security review and full AI execution gates are not required for this correction.
- Author preflight: spatial corridor uses live block/handle bounds and includes
  the gap without adding overlap or delaying hide. Other-block hover still switches
  target; outside movement hides it. Read-only/document-change paths still clear
  invalid active state, and document listener is removed on plugin destruction.
  Same-state status/options updates no longer follow an unchanged caret; real
  selection, focus, key and document changes retain the existing keyboard path.
- Three source/test files sorted path + NUL + bytes + NUL SHA-256:
  be3508bbd4827aa813bade5b52222fa4c982ce2a08fe4f3c6d14d4ef44602db8.
  Prior work preserved. No commit made. No known remaining issue within scope.

Logs: `/tmp/languon-drag-hover-tests.log`, `/tmp/languon-drag-hover-types.log`,
`/tmp/languon-drag-hover-lint.log`, `/tmp/languon-drag-hover-browser.log` (failed
discovery run), `/tmp/languon-drag-hover-browser-pass.log` (final passing run).
Browser artifacts: `test-results/critical-flows/71cd70c0-c08f-4da3-bfb5-00df30cb1aab/`.
Rollback only this correction's corridor/update guards and test additions; no
migration, data cleanup or environment update required.

## Git handoff

The user subsequently requested committing the completed pending work. Earlier
no-commit statements describe implementation-time authority; this request
authorizes the local commit containing this record and its verified changes.
