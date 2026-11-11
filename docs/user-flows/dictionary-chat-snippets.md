---
feature: dictionary-chat-snippets
title: Dictionary Chat Snippets
status: current
last_verified: 2026-11-11
surfaces:
    - browser
    - api
source_paths:
    - .agent/features/063-dictionary-chat-snippets/**
    - .agent/improvements/product-ui-design-quality.md
    - apps/backend/src/modules/conversations/**
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/dictionary-chat-snippet-application.ts
    - apps/backend/tests/support/contextual-assistant-fixture.ts
    - apps/backend/tests/support/contextual-assistant-web-server.ts
    - apps/backend/tests/integration/modules/conversations/dictionary-snippet-*.test.ts
    - apps/web/src/fsd/features/dictionary-chat-snippets/**
    - apps/web/src/fsd/pages/dictionaries/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - apps/web/tests/e2e/contextual-assistant.journeys.spec.ts
    - packages/contracts/src/dictionary-chat-snippets.ts
    - packages/prompts/src/local/contextual-language-tutor.ts
    - packages/prompts/src/local/dictionary-language-policy.ts
    - scripts/critical-flows/registry.mjs
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/contextual-assistant.journeys.spec.ts
e2e_scenarios:
    - owned-chat-review-and-apply-snippets
related_features:
    - dictionary-platform
    - contextual-language-assistant-and-knowledge
    - ai-accounting
---

# Dictionary Chat Snippets

## What this verifies

An active dictionary owner asks its private contextual tutor for complete cards,
reviews immutable previews, selects cards and explicitly inserts them. Generation
never writes dictionary cards. Append, Prepend and Replace are separate learner
actions; generated snippets remain reusable in chat after insertion and reload.
Editing happens later in the ordinary dictionary editor. Shared readers and other
source kinds have no dictionary-snippet generation or application authority.

The browser journey retains real authentication, worker, Mastra tools, accounting,
PostgreSQL/Redis and dictionary writes; only the external model adapter returns
deterministic French cards. Separate default-provider SDK regressions prove Free,
Paid, exact retained readback, follow-up snippets and technical failure. Neither
layer proves live provider quality or authorizes paid calls.

## Start the development environment

Use Node 24 and repository pnpm. Follow the exclusive disposable setup and the
registered runner in [Contextual Language Assistant and Knowledge](contextual-language-assistant-and-knowledge.md#start-the-development-environment).
The dedicated fixture serves backend health at `http://127.0.0.1:4006/livez` and
Next.js at `http://localhost:3336`. Its exclusive confirmed PostgreSQL/Redis
pair is required; never substitute developer, shared or production data.

For the bounded critical journey, the existing guarded runner provisions and
cleans up its own disposable services. No additional feature flag is required:

```sh
pnpm test:e2e:critical -- --flow dictionary-chat-snippets
```

Use unique `example.test` identities, synthetic passwords and local verification
code `0000`. The fixture seeds synthetic accounting configuration and credit
funding. No live provider credential is required.
The fixture serves the normal dictionary page's learning-capability reads through
production routes with flashcard and sentence practice disabled. Startup validates
both canonical capability responses before accepting browser requests.

## Browser verification

1. Create an owned French-to-English dictionary with Transcription, Definition,
   Context example and Example translation enabled. Add one ordinary saved card,
   then open **Open language tutor** and explicitly send a request for three cards.
   Expect the new retained snippet to open once, showing a distinct summary,
   card count, selection/actions and compact source/translation rows with natural
   French noun articles. Each row's **Card details** control independently reveals
   its complete generation-enabled fields. Use Enter and Space to open/close a
   row; this must not select or deselect it. The preview contains no editable
   fields, and generation alone leaves the dictionary unchanged.
   Open all three entries to exercise overflow. At desktop widths of at least
   1024px, the card list is scrollable with a maximum height of `50vh`; all entries
   remain in the list without pagination. Focus the list and use keyboard
   scrolling/Tab to reach the final entry. Selection and insertion controls sit
   outside the scrolling list and remain reachable above and below it.
2. Use keyboard Space to deselect the middle card, then **Prepend**. Expect only
   the first and third cards in their original order before the existing card.
   Reuse the same snippet with **Append**. All cards are added deliberately,
   including duplicates; a non-blocking success notification reports their count.
   Fold/reopen the artifact using **Review cards** and expect the current
   selection to remain intact. Manual folding must not be undone when an
   insertion finishes or the existing result is refetched.
3. Reload and reopen chat. Expect the same retained snippet to start compact,
   with **Review cards**, identity and card count visible. Opening the artifact
   shows compact rows, and opening a row restores its full read-only fields.
   Change the dictionary's current settings, then select another subset and append
   it. Generation-time fields remain inspectable; a settings-age banner or
   regeneration requirement does not appear. Ordinary current write versions
   still protect against concurrent mutations.
4. At 390 × 844, confirm compact rows, independent checkboxes/detail controls,
   revealed field labels and action buttons remain reachable without horizontal
   overflow. Below 1024px the list's maximum height is `70vh`. **Replace** names the current active
   card count. Escape or **Cancel** leaves all cards intact. Confirming archives
   all currently active cards and inserts the selection with fresh IDs and AI
   authorship. Previously archived cards and learning history remain retained;
   dictionary title and settings are unchanged.
5. Fold and reopen the tutor without reloading. Expect retained snippets to be
   compact again. Fold the tutor and open the inserted card's normal **Edit**
   action. Its saved values are editable there. Check desktop 1440 × 1000
   rendering, keyboard selection/disclosure and modal dismissal, console errors
   and unexpected failed requests.
6. Check the outer artifact and individual row disclosure in ordinary and reduced
   motion preferences. Both use a 200ms grid transition in ordinary motion;
   reduced motion removes the perceptible transition. Collapsed panels remain
   mounted for the animation but expose `aria-hidden` and `inert`, so hidden
   controls cannot receive focus. The lower **Collapse cards** action restores
   focus to the artifact's summary control. Do not rely on timing sleeps or a
   particular intermediate animation frame to verify these outcomes.

## Isolated visual previews

The colocated dictionary snippet presentation stories render the actual leaf
component with typed fake values and controlled callbacks. They expose compact
history, expanded results, individual details, selection, long localized content,
large scrollable results and relevant pending/error states without mounting the full chat,
logging in or calling the backend/model. Use the existing Storybook catalog's
viewport and theme controls to inspect density and contrast. A representative
50-card story complements the real three-card insertion journey; stories do not
replace integration, lifecycle or persistence proof.

## API verification

Use a bearer token from ordinary local signup/verification and the configured
local Origin. Do not place tokens, share secrets or real learner data in examples.

1. Create a conversation whose source is the same owned active dictionary and
   submit an ordinary admitted turn. Successful native `propose_dictionary_snippet`
   work persists a private snippet through its claimed worker operation.
2. `GET /conversations/{id}/dictionary-snippets` returns retained snippets with
   complete immutable cards and their frozen generation context. Exact follow-up
   reads use `read_dictionary_snippet`; they do not reconstruct values from chat
   summaries or consume the earlier artifact.
3. `POST /conversations/{id}/dictionary-snippets/{snippetId}/apply` sends a fresh
   `operationId`, `mode` (`append`, `prepend` or `replace`), unique nonempty
   `selectedIndices`, `expectedDictionaryVersion` and `expectedSettingsVersion`.
   Values, authorship and target dictionary are server-resolved. Reads and writes
   require current owner/source authorization; foreign conversations, shared
   readers, forged selections and inaccessible sources are rejected.
4. Retry an uncertain operation with the exact same operation ID and body to get
   the same result. A later deliberate insertion uses another ID. Duplicate
   content remains allowed and its count is returned. Current write conflicts or
   capacity failure leave the whole dictionary unchanged; generation-context age
   alone does not reject application.

## E2E coverage

`owned-chat-review-and-apply-snippets` covers real admitted native-tool generation,
new-result opening, independent keyboard disclosure/selection, all generation-enabled
fields on demand, fold-preserved selection, ordered subset Prepend and Append,
deliberate reuse/duplicate notification, compact history after reload/reopening,
bounded desktop/mobile scrolling, final-entry keyboard reachability, ordinary and
reduced-motion disclosure configuration, changed current settings, Replace
cancellation/confirmation, archival IDs and fresh saved editable cards at desktop
and narrow widths. Its critical registration
selects exactly this test.

Exhaustive authorization, idempotency mismatch, capacity rollback, retained
progress/history, concurrent transactions and operation fences belong to focused
real database/HTTP tests. Default-provider SDK tests separately prove Free/Paid
completion, exact prior-snippet follow-up and no-charge technical failure.

## Expected failure and edge cases

- Empty selection disables all apply actions. Pending actions disable repeated
  clicks. Preview fields are plain React text, including untrusted model output.
- Disclosure is presentation state: folding preserves the current task and does
  not insert cards. Historical snippets start compact; refetch/reconnect must not
  repeatedly reopen a snippet the learner folded. Card selection and detail
  disclosure are independent, and every generation-enabled field remains
  reachable through the row's detail control.
- All generated entries remain in one scrollable list. Select all still refers
  to the complete snippet, including entries outside the visible scroll area.
  Collapsed animated panels are inert and hidden from assistive technology;
  reduced motion must not prevent expansion or hide content permanently.
- Network errors retain the selection and expose Retry. An unchanged retry keeps
  the same operation/body; changing selection starts a new deliberate operation.
- Ordinary current-version conflicts display standard dictionary guidance.
  Explicit Retry rereads current versions and starts a new operation; Replace
  requires another confirmation with the updated active-card count. Ambiguous
  transport or server failure retries preserve the original operation and body.
- Replace archives rather than permanently deletes; there is no immediate Undo.
  Snippets remain reusable and are never marked consumed.
- Shared readers, other sources and archived/inaccessible dictionaries cannot
  gain owner authority by copying a snippet or supplying a target ID.
- Generation failures preserve normal conversation failure/retry behavior and
  admitted accounting protections. Applying an existing snippet makes no AI call.

## Automated regression checks

```sh
pnpm --filter @languon/web exec vitest run tests/dictionary-chat-snippets.test.tsx
pnpm test:e2e:critical -- --flow dictionary-chat-snippets
pnpm user-flow:e2e -- check dictionary-chat-snippets
pnpm docs:user-flows:check
```

The critical runner owns the browser configuration, disposable infrastructure,
minimum test count and clean-pass report. Use the registered contextual runner
for a manual focused browser phase with its documented exact environment.

## Troubleshooting

Rejected local targets or occupied ports require resolving the fixture's own
infrastructure identity; never reuse an unrelated running service. If no snippet
appears, inspect canonical turn/tool status and the authenticated snippet-list
response. A queued turn is not completed generation. Check enabled-field values
and the trusted language pair when the deterministic fixture rejects output.

## Cleanup

Close task-owned browser sessions and stop only task-owned processes/containers.
The critical runner removes its exclusive disposable services; the contextual
runner retains synthetic rows for diagnosis and removes only its own Redis
namespace. Never reset normal development, shared, staging or production data.
