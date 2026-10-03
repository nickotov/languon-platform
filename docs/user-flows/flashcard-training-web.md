---
feature: flashcard-training-web
title: Flashcard Training Web
status: current
last_verified: 2026-10-02
surfaces:
    - browser
source_paths:
    - .agent/features/034-flashcard-training-web/**
    - apps/web/src/fsd/features/flashcard-training/**
    - apps/web/src/fsd/widgets/dictionary-editor/**
    - apps/web/src/fsd/pages/shared-dictionary/**
    - apps/web/src/fsd/shared/i18n/**
    - apps/web/playwright.config.ts
    - apps/web/tests/e2e/flashcard-training.journeys.spec.ts
    - packages/contracts/src/learning/**
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/flashcard-training.journeys.spec.ts
e2e_scenarios:
    - owner-sets-up-rates-and-undo
    - shared-learners-keep-personal-progress
    - anonymous-practice-does-not-persist
    - rtl-touch-reduced-motion-training
related_features:
    - flashcard-training-backend
    - dictionary-platform
    - user-authentication
---

# Flashcard Training Web

## What this verifies

Training-only integration of the returned design: Train, setup, learning cards,
explicit rounds, Undo and learner-specific saved progress. Dictionary previews
and authoring remain unchanged. Known percentage is self-assessment, not accuracy
or spaced repetition. Anonymous sessions are local; signed-in shared readers save
independent progress.

## Start the development environment

Use the [authentication setup](user-authentication.md) and existing singleton
migrations. All card writers/purge workers must support
[ADR-0024](../adr/0024-flashcard-learning-state-and-revisions.md) before activation.
Cards is enabled by default. Set `LEARNING_FLASHCARDS_ENABLED=false` explicitly
to disable training, and restart the backend after environment changes.
[ADR-0025](../adr/0025-flashcard-capability-enabled-by-default.md) replaces the
earlier default-off policy; compatible migrations/writers/purge remain required.
Production deployment is excluded.

Automated journeys require `AUTH_E2E_WEB_ORIGIN`, `AUTH_E2E_BACKEND_ORIGIN`,
`AUTH_E2E_DATABASE_URL` and `AUTH_E2E_REDIS_URL`: explicit unused credential-free
loopback HTTP ports and disposable test PostgreSQL/Redis. Database name must
contain `test` or `e2e`. Never reuse normal development/shared/staging/production
data. Reviewed Playwright config starts the real API, worker and web and enables
training only in that test API. Use synthetic accounts/vocabulary and deterministic
local verification code. Exact verified services/commands/cleanup belong to the
[feature evidence](../../.agent/features/034-flashcard-training-web/EVIDENCE.md).

## Browser verification

1. Create an active English-to-Spanish dictionary and a manual card. Existing
   dictionary previews remain intact; Train is beside Add card.
2. Choose Train → Cards. Sentences is disabled/Coming soon. Setup defaults to
   target example on Front, source example on Back and Shuffle. Missing examples
   fall back to words. Empty dictionaries explain why Start is disabled; archived
   dictionaries cannot train.
3. Change fields/order. Each side needs fields; identical choices warn but remain
   allowed. Manual selections survive search/pages. Cancel saves nothing.
   Eligible/Skipped/With fallback counts describe projected cards.
4. Start requests fullscreen during the click, with viewport fallback. Dialog view
   preserves face/position/stats. Fullscreen Escape goes to dialog; dialog Escape
   opens End confirmation. Backdrop clicks do not end practice.
5. Flip by card click or Show back/front. Rate with buttons, arrows or horizontal
   drag. Scrolling/text selection do not rate. Signed-in advance waits for ACK;
   failed saves preserve the choice/card and retry the same operation.
6. Undo latest rating, restoring prior face/counts. Complete a round and inspect
   separate round/session/saved totals. Again requires an explicit new round.
   Start over and Finish are distinct actions.
7. Finish/reload: signed-in preferences persist; queue/manual subset do not resume.
   Shared learners retain separate progress. Anonymous results are never imported.
8. Verify narrow/wide, light/dark, keyboard, long/RTL and reduced motion. Compare
   only selected training surfaces; missing reference-rendered captures must stay
   explicit in evidence, not treated as a fidelity pass.

## E2E coverage

- `owner-sets-up-rates-and-undo`: real signup/manual creation, setup, acknowledged
  rating/Undo, dialog transition, completion and reloaded preferences.
- `shared-learners-keep-personal-progress`: real sharing and separate signed-in
  readers save their own results and see independent current totals.
- `anonymous-practice-does-not-persist`: anonymous shared practice completes
  locally without personal preference/attempt writes.
- `rtl-touch-reduced-motion-training`: creates a real Arabic/English card and
  runs three complementary checks: at 1440×1000 with CSS scale 200% it verifies
  the long RTL card's `lang`/`dir`, reduced transition, and visible card/text
  containment at the equivalent 720px content width; after resetting that
  scale, a real 720×500 Dialog view verifies End and Known controls are in the
  viewport; a separate 390×844 `hasTouch`/reduced-motion context verifies
  vertical internal card scrolling does not rate and a native Chromium CDP
  horizontal touch swipe does complete the round. CSS scale is a content-layout
  surrogate only: it does not claim native browser-chrome zoom or a valid
  top-layer dialog viewport measurement, and normalized `scrollWidth` checks
  account for the known scale.

Backend projection/revisions/purge/concurrency/replay remain covered by its guide.
Exhaustive UI state/transport/gesture matrices belong to focused lower-layer tests.

## Expected failure and edge cases

Disabled capability omits Cards; availability failures offer Retry. Preference
conflicts preserve draft and require Reload or explicit Overwrite. Missing entries
are skipped; edited cards must load current content before rating. Access/auth loss
clears practice. Undo cannot overwrite newer results/changed cards. Failed saves
preserve pending choices; retries respect server delay. End confirms acknowledged
results stay saved but queues/Undo cannot resume. Identity changes end practice;
anonymous results stay local.

## Automated regression checks

From repository root with the guarded disposable environment above:

```sh
pnpm --filter @languon/web exec playwright test tests/e2e/flashcard-training.journeys.spec.ts --workers=1
pnpm user-flow:e2e -- check flashcard-training-web
pnpm docs:user-flows:check
pnpm --filter @languon/web typecheck
```

Guide remains draft until current mapped journeys and required browser checks pass.
Mapping/static checks alone do not establish runtime behavior.

## Troubleshooting

- No Cards: confirm the local backend flag, restart that process, retry availability.
- Shared unavailable: retain link fragment; never log/persist its key or put it in
  query strings.
- No eligible cards: choose populated/enabled fields. Only examples fall back.
- Fullscreen unavailable: viewport fallback is supported.
- Occupied test port: use another loopback port; do not adopt/kill unrelated apps.

## Cleanup

Close only the task-owned browser session and stop only processes/containers
created for this verification. Dispose of their synthetic test data. Preserve
existing development services and unrelated sessions; never use broad cleanup
commands or delete shared/staging/production data. Record exact cleanup in evidence.
