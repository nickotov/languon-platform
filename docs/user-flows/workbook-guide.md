---
feature: workbook-guide
title: Workbook guide
status: current
last_verified: 2026-11-15
surfaces:
    - browser
source_paths:
    - .agent/features/068-workbook-guide/**
    - apps/web/src/app/workbook/**
    - apps/web/src/fsd/pages/workbook-guide/**
    - apps/web/src/fsd/widgets/app-shell/ui/sidebar/**
    - apps/web/src/fsd/shared/i18n/messages/navigation.ts
    - apps/web/src/fsd/entities/learning-blocks/**
    - packages/contracts/src/exercise-activity*.ts
    - apps/web/tests/e2e/support/contextual-assistant-playwright.config.ts
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/workbook-guide.journeys.spec.ts
e2e_scenarios:
    - public-guide-navigation-and-prepared-check
    - hybrid-and-illustrative-feedback
    - prompt-copy-and-responsive-guide
related_features:
    - interactive-workbooks
    - global-app-shell
---

# Workbook guide

## What this verifies

The public **Workbook guide** explains how learning material becomes interactive
practice. Guests and signed-in learners can visit `/workbook` and
`/workbook/exercises` without creating a note, starting a model request or spending
credits. This is separate from the saved collections at `/workbooks`.

The exercises chapter offers all 19 named activities in four categories, with one
synthetic English A2 example mounted at a time. Prepared answers use the same local
checking behavior as real exercises. Preset AI feedback illustrates a response to
its own displayed sample answer; it never grades arbitrary learner input.

## Start the development environment

Use Node 24, pnpm, Docker and the project-installed Playwright Chromium. Reuse
the guarded contextual-assistant browser harness and its disposable local fixture.
The critical runner owns PostgreSQL, Redis, migrations, the deterministic backend
and Next.js, with browser origin `http://localhost:3336` and backend health at
`http://127.0.0.1:4006/livez`. Never substitute shared services or paid providers.
No signup, email or model credentials are needed for these public journeys.

Run the focused registered journey from the repository root:

```sh
pnpm test:e2e:critical -- --flow workbook-guide
```

For manual development, use the normal root README environment and open
`/workbook`. The guide itself requires no new environment variables or feature
flags. Existing app session restoration can make an authentication request;
it must not create learning content or AI work.

## Browser verification

1. As a signed-out guest, open `/workbook`. The sidebar exposes **Workbook guide**
   and the overview explains source material, explicit generation, review, insertion,
   save and practice. Follow the exercises chapter link. It opens
   `/workbook/exercises` with V02 selected. The sidebar link is active on both
   guide routes and inactive on `/workbooks`. Signed-in navigation retains the
   same static entry outside its private Library. Collapsing the desktop sidebar
   retains its accessible label; a narrow drawer closes after following it.
2. On wide desktop layouts, use the grouped **Exercises** navigator on the right.
   It aligns alongside the chapter header and exercise content, stays available
   while scrolling, and marks the selected exercise. Its scrollable height is
   capped at 70vh. On smaller
   layouts, use the bottom **Activity** selector. Its four groups contain 19 activities. Select
   a prepared multiple-choice response and choose **Check answer**. Observe actual
   local correct/incorrect feedback. **Reset example** clears that example's
   current answer and feedback. Reloading does not restore a saved attempt.
3. Open `/workbook/exercises?activity=V03` directly. Enter an answer outside the
   prepared keys and check it. It stays unchecked, without fabricated incorrect
   grading or an AI request. Entering a prepared answer can be checked locally.
4. Select an AI-checked activity such as V07. Type a response. Its arbitrary text
   is never sent for evaluation. Choose **Show sample feedback** to view a preset
   sample answer with clearly illustrative feedback. Reset or change the activity;
   the previous local response and sample feedback disappear.
5. Copy an exercise prompt and sample source. Paste into a local scratch editor
   to verify useful plain text. Compare the exact-activity, best-fit and mixed-set
   recipes. Follow **Knowledge** only when ready to create your own material;
   this is an ordinary navigation link and creates no automatic draft. Review,
   insert and explicitly save generated material in the real workspace.
6. Repeat the chapter at 390px and 768px viewport widths in light and dark
   themes. The bottom Activity selector stays visible while scrolling; source,
   recipe and final copy controls remain above it. Switch exercises after scrolling
   and confirm the selected heading clears the top bar. On a short desktop viewport,
   open a direct W01 link and confirm its selected entry is visible in the right
   navigator. Labels, answer and check/reset controls remain reachable. Observe the
   browser console and all unexpected mutation/model requests.

## E2E coverage

- `public-guide-navigation-and-prepared-check`: guest sidebar discovery, overview
  to exercises navigation, the complete 19-activity chooser, real local prepared
  feedback, reset and reload without stored attempts, plus localized server-rendered page titles.
- `hybrid-and-illustrative-feedback`: direct activity links, prepared-answer
  boundary for hybrid input, typed AI responses remaining ungraded, separate
  successful and incorrect preset feedback, reset and activity-switch state isolation,
  and invalid-ID fallback.
- `prompt-copy-and-responsive-guide`: clipboard prompt/source contents, ordinary
  Knowledge navigation, theme/narrow layout and navigation drawer behavior.

Every scenario observes domain-mutation requests and requires none. Corpus unit
tests cover all synthetic examples against real schemas and checking rules; shell
unit tests cover guest/member, expanded/rail/drawer labels and exact active-route
matching. Those exhaustive matrices are not duplicated in browser journeys.

## Expected failure and edge cases

An unknown `activity` value falls back to V02. Hybrid answers outside prepared keys
remain unchecked; absence of a local key is not proof that an answer is wrong.
AI-only examples require no network check. Their feedback always names a displayed
preset response rather than using the learner's answer. Switching activities and
resetting remove local state. There is no saved progress, note mutation or credit
charge. Clipboard failure leaves visible prompt/source text available to select
manually. Real Knowledge remains subject to its normal authentication and explicit
save behavior; the guide does not bypass it.

## Automated regression checks

```sh
pnpm --filter @languon/web exec vitest run tests/app-shell.test.tsx
pnpm user-flow:e2e -- check workbook-guide
pnpm docs:user-flows:check
pnpm test:e2e:critical -- --flow workbook-guide
```

Traceability checks prove current mapping, not browser success. Runtime evidence,
configuration and any missing gates belong to Feature 068's EVIDENCE.md.

## Troubleshooting

Occupied ports or unavailable Docker fail the guarded runner before its browser
journeys. Inspect retained logs and backend health; stop only task-owned processes.
If a direct activity link seems unchanged, check its exact case-sensitive ID.
If copy fails due to browser permissions, use the visible source and prompt text.
Any content-creation, answer-submission or model request from a demo is a defect;
retain its path and method without logging account tokens or learner text.

## Cleanup

The runner stops its own application processes and removes its disposable
containers. Traces/screenshots remain in ignored test output. Public guide
interaction creates no content to delete. Do not reset ordinary development,
shared, staging or production databases.
