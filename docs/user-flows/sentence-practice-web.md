---
feature: sentence-practice-web
title: Sentence Practice and Model Preferences Web
status: current
last_verified: 2026-10-05
surfaces:
    - browser
source_paths:
    - .agent/features/037-sentence-practice-web/**
    - apps/web/src/fsd/features/sentence-training/**
    - apps/web/src/fsd/features/text-ai-preferences/**
    - apps/web/src/fsd/widgets/dictionary-training/**
    - apps/web/src/fsd/pages/profile/**
    - apps/web/playwright.config.ts
    - apps/web/tests/e2e/sentence-practice.journeys.spec.ts
    - apps/backend/tests/support/sentence-web-worker.ts
    - packages/contracts/src/learning/sentences.ts
    - packages/contracts/src/text-ai/**
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/sentence-practice.journeys.spec.ts
e2e_scenarios:
    - model-preference-persistence
    - owner-reader-reference-practice
    - anonymous-share-sign-in-continuation
    - cancellation-requested
    - rtl-non-latin-accessibility
    - model-preference-back-fallback
related_features:
    - user-ai-model-preferences-backend
    - sentence-practice-backend
    - flashcard-training-web
    - user-authentication
---

# Sentence Practice and Model Preferences Web

## What this verifies

Account text-AI model preferences and sentence training against the completed
backend. Saved sentences are reused before generation, AI checks remain the
default, and explicit reference reveal records a separate personal manual review.
Sharing never shares another learner's answers, scores or manual reviews.

## Start the development environment

Use the existing [authentication E2E harness](../../apps/web/tests/e2e/README.md)
with disposable loopback PostgreSQL/Redis and unused local web/API ports.
Set `AUTH_E2E_SENTENCE_SERVICES=true` for these tests. The reviewed Playwright
configuration enables sentence admissions and starts a guarded synthetic-only
worker instead of the dictionary worker. It uses the real API, migrations,
database, auth, job execution, provider-output validation and credit settlement.
It never calls a paid model or loads provider credentials. A full run reuses one
verified synthetic owner per worker through real UI login; each dictionary and
the two reader identities remain separate. This keeps the production five
email-send attempts/client/hour limit intact. Use fresh owned Redis test state
for each repeated full run; never flush shared Redis to make a test pass.

The fixture worker grants credits only to synthetic owner accounts from the
current run. Reader accounts have a limited wallet with zero credits. A curated
model and compatible worker observation are local fixture data. Do not point this
harness at development, shared, staging or production data. Sentence capability
remains disabled by default outside this explicit test configuration.

## Browser verification

1. Sign up with a synthetic account and verify locally. Open Profile → Account.
   Select an available curated model and save. Reload and confirm it remains
   selected. A second tab with an older version must preserve its draft on a
   save conflict and offer explicit recovery.
2. Create an English-to-Spanish dictionary and a manual `book` / `libro` card.
   Train → Sentence practice opens setup. Choose direction, explanation language, all
   entries or a subset, and Saved first, Generate new or Review saved mode.
3. Start in a dialog or fullscreen. Source vocabulary offers keyboard-accessible
   hints. Enter a translation; switching presentation preserves draft and state.
   Check with AI submits a real job and displays server-owned feedback.
4. Close practice and create a sharing link. A separate verified reader opens it
   and starts saved-first practice. The owner's saved exercise is reusable but
   the owner's attempt is private.
5. The reader's default AI check fails with insufficient credits, creates no
   attempt and keeps the reference hidden. Explicitly reveal the reference with
   the reader's zero-credit wallet. The
   reference is fetched on demand and a manual review is recorded without an
   AI score or admitted AI-check job. Reader progress and owner review history remain
   separate. Check controls and reference at a narrow viewport.
6. Close practice, restore focus to Train, and inspect personal history/summary.
   Native fullscreen exit follows the existing flashcard convention. Access or
   identity loss must clear protected content rather than leave stale practice.
   Warmed history/setup must remain hidden after shared access is revoked even
   when fresh history/prepare/progress transport is unavailable.
7. An anonymous reader uses Sentence practice → Sign in. The capability stays in
   the URL fragment through login, and the verified reader can then practise.
   It never enters a query parameter or request body.
8. An answer over 4,000 Unicode code points remains editable and visible with a
   counter/error. AI checking is disabled until it is shortened. A rejected AI
   check leaves an unsent draft, so closing asks whether to discard it.
9. Cancel a running local synthetic generation. The button becomes disabled
   Stopping… until the server confirms cancellation. No result is published.
10. Arabic source and Japanese translation retain their own content direction
    and language tags. Reduced-motion mode has no running dialog animations.
    A documented 200% zoom layout simulation halves the CSS viewport and checks
    horizontal bounds of the source, answer, and actions;
    this evidence is not claimed to be browser UI zoom. At a narrow viewport,
    summary and personal history use bottom sheets and contain keyboard focus.
    A focused translation field with a reduced-height mobile viewport simulates
    keyboard occlusion; sticky actions remain reachable. This is viewport
    simulation, not evidence from a hardware keyboard. Interface RTL is not
    applicable to the four supported LTR UI locales; dictionary content RTL is
    verified separately.
11. With the Navigation API unavailable, dirty Account preferences survive Back
    and Keep editing. Discard returns to the actual previous route; Forward
    returns to a clean server preference without extra history entries.

## E2E coverage

- `model-preference-persistence`: real authenticated two-tab optimistic conflict,
  preserved selection, explicit recovery and reloaded server persistence.
- `owner-reader-reference-practice`: real manual card, generated exercise, hints,
  draft presentation continuity, default AI check, sharing, zero-credit AI-check denial and saved
  reference reveal, separate personal progress/history, over-limit draft
  retention, rejected-check close guard, unavailable-refresh cache invalidation
  after live access loss, and mobile containment.
- `anonymous-share-sign-in-continuation`: real anonymous entrypoint, sign-in
  and restored shared capability for a previously verified reader.
- `cancellation-requested`: real slow deterministic provider boundary, running
  job cancellation, disabled Stopping state and no published exercise.
- `rtl-non-latin-accessibility`: Arabic/Japanese dictionary, valid generated
  vocabulary mapping, content direction, reduced motion, honest 200% zoom viewport simulation
  stress, compact history/summary sheet focus and containment, and focused
  reduced-height viewport keyboard simulation with reachable sticky actions.
- `model-preference-back-fallback`: Navigation API absent, client navigation,
  Back Keep editing/Discard, Forward and history length preservation.

Exhaustive race, replay, pricing, cancellation, malformed generation and live
authorization matrices remain in backend and controller tests. Source inventory
comparison and dark/RTL state checks complement these critical browser journeys.

## Expected failure and edge cases

Model unavailability and optimistic conflicts never silently replace the saved
choice. Save errors keep the draft. Empty or exhausted review mode never generates
sentences. Credit shortages do not reveal the reference automatically. Stored
reference review needs no available model or credits. Cancelled or unconfirmed
jobs preserve replay identity; Retry cannot create duplicate paid work. Leaving
an active job does not promise cancellation or a refund. Shared access/auth loss
clears protected content. Reference review is self-assessment, not an AI grade.

## Automated regression checks

From repository root with the guarded disposable environment described above:

```sh
AUTH_E2E_SENTENCE_SERVICES=true pnpm --filter @languon/web exec playwright test tests/e2e/sentence-practice.journeys.spec.ts --workers=1
pnpm user-flow:e2e -- check sentence-practice-web
pnpm docs:user-flows:check
```

The mapped journeys must pass before marking this guide current. Compilation
and mapping alone do not prove browser behavior or supplied-design visual fidelity.
Retained screenshots cover preference states, ready setup, draft, pending check,
feedback and free reference/history in desktop/mobile and light/dark modes.
Focus containment, native/viewport presentation continuity, action reachability
and horizontal overflow are also checked.

## Troubleshooting

- Missing Sentence practice: confirm the local test opt-in and restarted API.
- No available model: confirm the synthetic fixture account and worker are from
  the same run ID; never add real provider credentials to make this test pass.
- Shared access unavailable: retain the link fragment and live sharing authority;
  never log or persist the share key.
- Occupied test ports: choose unused loopback ports; do not adopt unrelated apps.
- Fullscreen denied: viewport fullscreen is the supported fallback.

## Cleanup

Close only this run's browser contexts. Playwright stops its owned application
processes. Stop only explicitly owned disposable containers and remove synthetic
test data by disposing of that infrastructure. Preserve existing development
services and unrelated sessions; never flush shared Redis or reset a shared DB.
