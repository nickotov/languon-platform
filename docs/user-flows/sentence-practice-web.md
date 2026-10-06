---
feature: sentence-practice-web
title: Sentence Practice and Model Preferences Web
status: current
last_verified: 2026-10-06
surfaces:
    - browser
source_paths:
    - .agent/features/037-sentence-practice-web/**
    - .agent/features/038-sentence-practice-assistance/**
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
    - finite-round-saved-reentry
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
A round covers each selected word once by appearance. Saved first includes
previously checked or manually reviewed examples; New examples explicitly
requests fresh generations without discarding older examples or personal history.
Coverage exhaustion keeps the final sentence answerable; its successful AI check,
explicit reference reveal/comparison or skip replaces practice with results.
Contextual whole-phrase hints support the required words without adding targets.
Free comparison reports a conservative reference match or difference, not semantic
correctness or an AI score. Results offer exact ordered replay or fresh examples
for the same words. All seven mapped Chromium scenarios passed in the final
feature 038 run on 2026-10-06; independent feature completion review and scoped
integration remain separate delivery gates.
The practice surface uses a compact header with progress and settings/history/close
controls, a centered scrolling canvas, a sentence card and a fixed action footer.
Required dictionary hints use solid marks; contextual hints use dashed marks.
AI and free reference feedback remain visually distinct. The final-sentence
notice precedes the draft; results replace the practice form and footer after its
final action. The footer provides one free action: reveal the saved reference for an empty
answer, or compare a typed answer with it. Generation status follows the sentence
skeleton; checking status follows the answer field. The two-method explanation
follows AI feedback and earlier attempts. The UI fidelity maintenance is tracked in
[its improvement record](../../.agent/improvements/sentence-practice-ui-fidelity.md).

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
defaults on in development/test and off in staging/production; an explicit
`LEARNING_SENTENCES_ENABLED` setting overrides that default.
The reviewed sentence fixture explicitly admits `sentence-generation:v2` and
advertises its compatible deterministic worker. Ordinary development retains
v1 admission unless explicitly activated with compatible UI, worker allowlists
and model revision. Verification never changes the user's configuration/data.

## Browser verification

1. Sign up with a synthetic account and verify locally. Open Profile → Account.
   Select an available curated model and save. Reload and confirm it remains
   selected. A second tab with an older version must preserve its draft on a
   save conflict and offer explicit recovery.
2. Create an English-to-Spanish dictionary and a manual `book` / `libro` card.
   Train → Sentence practice opens setup. Choose direction, explanation language, all
   entries or a subset, and Saved first, Generate new or Review saved mode. Target-to-source
   is initially selected; the other direction remains selectable.
3. Start in a viewport-filling dialog or fullscreen. Close practice stays reachable
   in the sticky header. AI settings opens within the same dialog with a Back
   control; returning preserves the answer draft and guards unsaved model choices.
   Required source vocabulary uses solid hint styling; supporting contextual
   content words and whole idioms/phrases use dashed styling and a labelled legend.
   Keyboard/touch activation opens one hint at its active occurrence, including
   repeated IDs; helpers add no coverage or required assessments. Legacy saved
   examples without helpers remain usable. Enter a translation; switching
   presentation preserves draft and state. Check with AI submits a real job and
   displays server-owned feedback, including in final result details.
4. Close practice and create a sharing link. A separate verified reader opens it
   and starts saved-first practice. The owner's saved exercise is reusable but
   the owner's attempt is private.
5. The reader's default AI check fails with insufficient credits, creates no
   attempt and keeps the reference hidden. Explicitly reveal the reference with
   the reader's zero-credit wallet. The
   reference is fetched on demand and a manual review is recorded without an
   AI score or admitted AI-check job. Compare the exact retained draft with the
   reference: case, canonical Unicode, whitespace, ordinary punctuation and
   apostrophe variants may normalize to a match; accents, meaningful symbols and
   word order stay significant. A difference explains that another translation
   may still be valid. Empty answers show the reference without a match verdict.
   Reader progress and owner review history remain separate. Check free controls,
   comparison and final results at a narrow viewport.
6. Close practice, restore focus to Train, and inspect personal history/summary.
   Native fullscreen exit follows the existing flashcard convention. Access or
   identity loss must clear protected content rather than leave stale practice.
   Personal history is an inner practice view with Back, rather than another
   modal. Warmed history/setup must remain hidden after shared access is revoked even
   when fresh history/progress transport is unavailable. From the reader's
   completed results, revoke sharing in the owner session, then choose Repeat
   these exact examples. Its live whole-list preparation must fail with lost
   authority and erase protected result/reference/history/setup caches. Do not
   trigger this check through an AI-check button: that exercise action is no
   longer present on the completed results screen.
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
    results replace practice and personal history uses the current practice
    surface with Back. The single learning dialog contains keyboard focus.
    A focused translation field with a reduced-height mobile viewport simulates
    keyboard occlusion; sticky actions remain reachable. This is viewport
    simulation, not evidence from a hardware keyboard. Interface RTL is not
    applicable to the four supported LTR UI locales; dictionary content RTL is
    verified separately.
11. With the Navigation API unavailable, dirty Account preferences survive Back
    and Keep editing. Discard returns to the actual previous route; Forward
    returns to a clean server preference without extra history entries.
12. Create a French/Russian dictionary with five complete selected words. Choose
    Russian source → French answer. Confirm each presented sentence is Russian
    and its lexical hints are French. Advance through the round, including skips:
    repeated targets count once, and all five words appearing exhausts coverage.
    The final sentence remains available to translate, check or reveal; successful
    AI checking or reference reveal/comparison, or Skip and finish, replaces the
    exercise with results without admitting another generation. AI checks, manual
    reviews and skips remain separate, with final feedback/reference in details.
    Repeat these exact examples validates the entire previous sequence, then
    replays the same exercise IDs in the same order with fresh drafts/counters,
    no generation and no substituted saved examples. Generate new examples
    explicitly requests fresh IDs for the same required words; failure retains
    completed results unless authority/content became invalid. Start again
    in Saved first: previously checked or manually reviewed sentences and hints
    are reused without another generation. Explicitly select New examples to
    generate a fresh round, even after all words have lifetime exposure.

## E2E coverage

- `model-preference-persistence`: real authenticated two-tab optimistic conflict,
  preserved selection, explicit recovery and reloaded server persistence.
- `owner-reader-reference-practice`: real manual card, generated exercise, hints,
  draft presentation continuity, default AI check, sharing, zero-credit AI-check denial and saved
  reference reveal, separate personal progress/history, over-limit draft
  retention, rejected-check close guard, exact-replay whole-list preparation
  after sharing revocation and unavailable-refresh protected-cache invalidation,
  and mobile containment. Feature 038 extends this scenario
  with contextual whole-phrase hints, free conservative comparison, replacement
  results with final details and inline history/settings navigation.
- `anonymous-share-sign-in-continuation`: real anonymous entrypoint, sign-in
  and restored shared capability for a previously verified reader.
- `cancellation-requested`: real slow deterministic provider boundary, running
  job cancellation, disabled Stopping state and no published exercise.
- `rtl-non-latin-accessibility`: Arabic/Japanese dictionary, valid generated
  vocabulary mapping, content direction, reduced motion, honest 200% zoom viewport simulation
  stress, inline history/result focus and containment, and focused
  reduced-height viewport keyboard simulation with reachable sticky actions.
- `model-preference-back-fallback`: Navigation API absent, client navigation,
  Back Keep editing/Discard, Forward and history length preservation.
- `finite-round-saved-reentry`: five-word French/Russian round with Russian
  sentences and French hints/reference, skips counted toward all five words,
  final-action replacement results without a sixth admission, exact ordered
  session replay without generation, deliberate fresh IDs for the same words, later
  Saved first reuse including a manually reviewed example, and five fresh
  New examples despite lifetime exposure.

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
Transient prepare/admission/check/poll failures retry up to three transport
attempts while retaining the original operation or job identity and typed answer.
Retries honor server retry timing; a delay beyond the bounded automatic recovery
window remains available for explicit recovery. Permanent failures, cancellation
and lost access do not trigger a replacement paid operation. Clearly reversed
writing-script output retries within the worker's existing generation limit;
malformed saved examples are excluded without deleting history. Script checks
cannot distinguish languages that share the same writing script.
Each sentence round contains at most 100 eligible words. For a dictionary batch,
setup explicitly explains that the first 100 eligible words in stable entry order
will be used. Choose entries with manual search and Load more to select up to
100 other words for a different batch.
Visited exercise IDs are limited to 100 and sentence HTTP JSON retains its
32,000-byte bound. Dictionary capacity remains 10,000 entries; lifetime progress
still covers the whole dictionary. Completion does not automatically start another
batch. Provider budgets, admission rates and cost limits stay the same, with no new
batch pagination. Controller and real-API tests cover these boundaries.

Free comparison is textual, not an AI grade or semantic verdict; it does not
replace the exact draft/reference with normalized text. Failed reveals expose no
reference or fabricated manual completion. Final pending/failed checks leave the
sentence answerable; successful low-scoring checks still complete the activity.
Exact replay validates every requested exercise before leaving results, uses
current authority on each read and never substitutes another example. A stale,
deleted or revoked example clears protected state and fails closed. Recoverable
replay/fresh-admission failures preserve prior results and operation identity.
Inline AI settings/history have Back and preserve drafts/focus without a second
modal. The viewport dialog remains 100dvw/100dvh with visible Close practice.

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

- Missing Sentence practice: restart the API and check for an explicit disabled
  sentence setting; development/test default to enabled.
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
