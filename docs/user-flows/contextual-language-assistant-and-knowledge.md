---
feature: contextual-language-assistant-and-knowledge
title: Contextual Language Assistant and Knowledge
status: current
last_verified: 2026-10-19
surfaces:
    - browser
    - api
source_paths:
    - .agent/features/044-contextual-language-assistant-and-knowledge/**
    - apps/backend/src/modules/conversations/**
    - apps/backend/src/modules/authentication/application/ports/rate-limiter.ts
    - apps/backend/src/modules/authentication/infrastructure/rate-limit/redis-rate-limiter.ts
    - apps/backend/src/modules/knowledge/**
    - apps/backend/src/modules/dictionaries/**
    - apps/backend/src/modules/texts/**
    - apps/backend/src/modules/users/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/infrastructure/text-ai/**
    - apps/backend/src/infrastructure/worker/**
    - apps/backend/src/app.ts
    - apps/backend/src/index.ts
    - apps/backend/drizzle/**
    - apps/backend/tests/support/contextual-assistant-*.ts
    - apps/backend/tests/integration/modules/conversations/**
    - apps/backend/tests/integration/modules/authentication/infrastructure/redis-concurrent-requests.test.ts
    - apps/backend/tests/integration/modules/authentication/infrastructure/production-redis-tls-acl.test.ts
    - infra/deploy/redis.production.acl.example
    - apps/web/src/app/knowledge/**
    - apps/web/src/fsd/shared/ui/companion-layout/**
    - apps/web/src/fsd/shared/ui/menu/**
    - apps/web/src/fsd/pages/texts/ui/workspace-page/**
    - apps/web/src/fsd/pages/shared-dictionary/**
    - apps/web/src/fsd/features/flashcard-training/ui/training-launcher/**
    - apps/web/next.config.mjs
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - apps/web/src/fsd/features/conversation-preferences/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/entities/conversation/**
    - apps/web/src/fsd/entities/knowledge/**
    - apps/web/src/fsd/pages/knowledge/**
    - apps/web/src/fsd/pages/profile/**
    - apps/web/src/fsd/widgets/dictionary-editor/**
    - apps/web/src/fsd/features/text-reading/**
    - apps/web/src/fsd/widgets/app-shell/**
    - packages/contracts/src/contextual-assistant.ts
    - packages/prompts/src/local/contextual-language-tutor.ts
    - scripts/run-contextual-assistant-e2e.mjs
e2e_command: contextual-assistant
e2e_tests:
    - apps/backend/tests/integration/modules/conversations/contextual-assistant.journeys.test.ts
    - apps/web/tests/e2e/contextual-assistant.journeys.spec.ts
e2e_scenarios:
    - source-chat-save-knowledge
    - knowledge-revision-stale-delete
    - private-shared-source-lifecycle
    - durable-close-reopen-stop-retry
    - dictionary-card-copies-preserve-visible-fields
related_features:
    - texts
    - dictionary-platform
    - magic-profile-page
    - user-ai-model-preferences-backend
    - ai-credit-wallet
    - profile-account-controls
---

# Contextual Language Assistant and Knowledge

## What this verifies

Signed-in learners ask about an accessible dictionary, text, or saved Knowledge
note. Each source-associated conversation is private to its learner. The
assistant streams explanations and can propose an editable Knowledge draft.
Only the learner's explicit save publishes the draft to the private library.
Saved notes have independent revisions and no originating-source links.

Execution status and limitations are recorded in feature 044’s EVIDENCE.md.
Provider quality and real paid model calls are outside deterministic regression
coverage.

## Start the development environment

The normal manual environment uses Node 24, pnpm, the documented local
PostgreSQL/Redis infrastructure, current project migrations, and the backend,
web, and durable worker commands from the root README. Configure the selected
Flash model and synthetic credit grants before a manual paid-provider check.
Never use a real learner account for verification.

The deterministic mapped suite starts the real backend and web with a test-only
composition. Success and persistence journeys replace only the external model boundary, retaining real
authentication, PostgreSQL, Redis, Mastra, tools, source authorization,
streaming, accounting, and Knowledge publication. It never resets schemas or
contacts a paid model. Provision exclusive disposable PostgreSQL on loopback
port 55444 with database `languon_auth_assistant_web_test`, and Redis on loopback
port 56444 database 1. The targets must contain no valuable data.

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true \
ALLOW_DISPOSABLE_REDIS_TESTS=true \
AUTH_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55444/languon_auth_assistant_web_test \
AUTH_TEST_DATABASE_CONFIRM=languon_auth_assistant_web_test \
AUTH_TEST_REDIS_URL=redis://127.0.0.1:56444/1 \
AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56444/1 \
pnpm test:e2e:contextual-assistant
```

The runner rejects missing confirmations, remote hosts, default ports, or other
database names. It runs composed HTTP tests first, then starts the fixture on
4006 and Next.js on 3336. Both ports must be free. Fixture identities are random
`example.test` accounts with synthetic passwords and local code `0000`.
The runner preserves and restores the existing generated `next-env.d.ts` bytes
on success or failure. Use the registered runner; direct dedicated Playwright
configuration startup requires its guard and does not own this cleanup.

## Browser verification

1. Sign in and open an owned dictionary or text. The circular AI tutor launcher is visible
   at the lower right. It does not load conversation history or subscribe to events
   until opened. Select **Open language tutor**.
   Hovering the icon on desktop shows **AI Tutor**. The non-modal **Language
   tutor** widget names its source. On desktop it opens in a dedicated slot to
   the right of the text dialog body or dictionary content, leaving the source
   scrollable, selectable and clickable. **More options** offers **Detached chat**:
   enable it for the floating chat, with corner docking and reading-size options;
   disable it to return beside the source. Switching placement preserves the
   unfinished question and conversation. Dictionary add-card and practice actions
   use icon buttons with descriptive tooltips on desktop.
   On a shared dictionary, a signed-in reader gets the same right-side tutor
   slot. A signed-out visitor sees **Sign in to ask the language assistant**
   inside the main dictionary content, with no collapsed chat slot hiding it.
2. Ask about meaning or grammar. A visible activity indicator covers admission,
   waiting for the first text, and tool work. The indicator shows **Writing…** as
   small text updates arrive and **Working…** while generation pauses; it remains
   visible even when an assistant placeholder is empty. Completed, failed and
   explicitly stopped turns remove the activity indicator. Streamed Markdown
   remains readable while incomplete and settles to the final explanation.
   Observe material discussed and final usage. Select **Charged credits** to open the usage popover above
   the answer action; it shows model, input/output tokens and estimated/reported
   accounting. Escape closes the popover and restores focus to its trigger.
   **Minimize tutor** folds the widget into the lower-right pill while preserving
   the question, attachments, scroll, note edits and running response. **Open language
   tutor** returns to the same conversation. **New conversation** starts separate
   history. Scrolling upward during streaming keeps that position; **Jump to latest**
   returns to the newest text.
   For dictionary questions, open **Add context /**, find and select a card. Close
   the picker and expand its attached chip to review all available fields. Repeat
   for a second card. Copies expose labeled source, translation, enabled
   definition/transcription/examples and field languages. Reopen after sending;
   the copied content remains readable with appropriate language direction.
   **Conversation history** opens the source’s saved chats. Deleting a history row
   opens confirmation; cancelling retains it, confirming removes its conversation.
3. Ask for a Knowledge note. A compact **Knowledge draft** appears. Before saving it,
   the Knowledge library remains unchanged. Select **Review and save** to open
   the dedicated editor. Folding and reopening preserves unsaved editor changes.
   Edit its title, explanation,
   summary, categories, and languages, then select **Save to Knowledge**.
4. Open **Knowledge**. Search by saved wording and filter by category/studied
   language. Open the saved note, edit it, and save. **Revision history** exposes
   earlier content. Restoring an earlier revision creates a new current version.
5. Ask about a saved note and request a revision. Change the saved note elsewhere
   before applying the draft. Its update is rejected; the draft remains for
   comparison or **Save as a new note**. No silent overwrite occurs.
6. On a narrow viewport, the tutor opens as a bottom sheet at full available height.
   It appears above the dictionary action buttons so they cannot cover the chat.
   Its handle and header controls switch between full and partial heights. Repeat fold/reopen at 390px and 320px and explicitly **Stop** a running
   response. Incomplete output is labeled. Final usage distinguishes reported
   values from estimates and labels input tokens, output tokens, and charged
   credits. **Retry response** starts only after
   learner action; it retains the original question without duplication.
7. Confirm **Delete note** and revisit its URL. It is unavailable, together with
   its source-associated conversations. Independently saved other notes remain.

Opening and folding use restrained transitions; reduced-motion preferences suppress
those transitions. Observe focus, labels, keyboard access, narrow-screen overflow, browser console
errors, and unexpected failed requests. Streaming cancellation may abort the
subscription; this is expected and does not cancel durable work.

## API verification

Use bearer tokens obtained through normal local signup/verification. Requests
with an Origin use the configured local web origin. Shared-source requests also
require `X-Languon-Share-Key`; never put the secret into logs or saved examples.

1. `POST /conversations` with an accessible typed source, then
   `POST /conversations/:id/turns` with a fresh `requestId`. Replaying the same
   request returns the same turn. `GET /conversations/:id` shows canonical
   messages, turns, usage, and private drafts.
2. `GET /conversations/:id/events?after=0` streams durable events. Reconnect with
   the last event cursor; do not admit a second turn to reconnect. Explicit
   `POST /conversations/:id/turns/:turnId/stop` cancels work.
3. Edit a draft through `PATCH /conversations/:id/drafts/:draftId`, then publish
   through its `/publish` route using a fresh operation ID and current version.
   `GET /knowledge` excludes unpublished drafts.
4. Update a note through `PATCH /knowledge/:id` using `expectedVersion`. A stale
   version returns 409. `/revisions` exposes history; `/restore` creates a new
   version. Confirmed versioned `DELETE /knowledge/:id` removes the note/history.
5. Use a second learner on a shared dictionary. The share capability authorizes the
   source, never another learner's private conversation. Revoke sharing and
   verify source conversation reads fail while a previously published private
   Knowledge note remains accessible to its owner.

## E2E coverage

| Scenario                                         | Observable proof                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source-chat-save-knowledge`                     | Attached text layout, circular launcher tooltip, detached/reattached draft retention, non-modal source selection, first-text waiting and midstream pause indicators, rendered incremental timing, folded editor retention, explicit publication and note revisions. |
| `knowledge-revision-stale-delete`                | Composed authenticated HTTP, idempotent turn, real SDK proposal/accounting, stale draft retention/new-note path, restore history, deletion and owner isolation.                                                                                                     |
| `private-shared-source-lifecycle`                | Real dictionary share capability, private reader conversation, denial to another learner, revocation and independently saved note survival.                                                                                                                         |
| `durable-close-reopen-stop-retry`                | Narrow bottom-sheet fold/reopen during work, no duplicate admission, explicit Stop, retained incomplete output, deterministic provider failure and explicit retry.                                                                                                  |
| `dictionary-card-copies-preserve-visible-fields` | Attached dictionary layout, desktop action tooltip and mobile chat stacking, real card APIs, fold-retained copies, field labels/languages, prompt delivery and readable history.                                                                                    |

The `dictionary-card-copies-preserve-visible-fields` scenario also rotates a real sharing capability,
opens the shared page as a separate authenticated reader and verifies right-side
placement. An isolated signed-out browser context verifies the sign-in link is
visible and clickable inside the main content.

The source-chat browser journey delays only the external deterministic provider,
emits four-character chunks every 140ms with a deliberate 1.1-second pause, and
records actual rendered text mutations. It asserts prefix-preserving small
updates, repeated subsecond delivery, empty-placeholder activity, pause activity,
and completion cleanup. A second authorized subscription through the actual
Next.js SSE proxy records wire delivery before display smoothing. It requires
at least three distinct increasing-content arrivals separated by more than40ms
and less than500ms, excluding coalesced same-packet bursts; a one-second polling
regression cannot pass through animation alone. The existing narrow-screen journey retains real
close/reopen, Stop, failure and explicit retry checks. No internal application
layer or network transport is replaced for this streaming proof.

Exhaustive category/schema validation, concurrency fences, accounting races,
observer/reflector budgets, source-copy markup, and SQL cleanup invariants remain
in focused domain, contract, repository, worker, and lifecycle tests.
The card-copy browser journey also checks model-unavailable guidance using one
explicitly controlled admission response before continuing through real
admission. That observation proves rendered guidance only; backend model and
accounting behavior have separate real composed HTTP/integration coverage.

## Expected failure and edge cases

- A missing/archived/inaccessible primary source hides its private conversations
  and drafts. Permanent primary deletion removes associated conversation data.
- A stale note or draft version returns conflict and preserves learner edits.
  A deleted target cannot be implicitly recreated by publishing an update.
- Auto chat uses DeepSeek Flash. An explicit incompatible/unavailable model
  fails visibly without fallback. Capacity/credit failures never silently charge
  an unissued provider call; incurred dispatched work remains accounted.
- Provider failures keep the learner question and incomplete assistant output.
  Conservative usage is visibly marked **Estimated**, with separate input/output
  token and charged-credit labels. Reopening reconnects. Retrying always requires
  explicit learner action.
- A learner can keep at most eight active assistant event subscriptions. Rapid
  reconnect attempts are also limited to twelve per minute. A busy/rate-limit
  response preserves durable work; wait briefly and retry the connection.
- A question and its attachments have an aggregate encoded limit of 8,000 UTF-8
  bytes, including private source metadata and a 1,024-byte transport allowance.
  An oversized request returns `context_too_large` before queuing or reserving
  credits. Shorten the question or remove attachments, then send again.
- Unsaved source content participates only after **Use current draft**. Saved
  source edits refresh the next admitted turn; earlier wording is preserved.
- Model/source text cannot authorize saving, deleting, or reading another source.
  AI explanations are not marked verified and may contain mistakes.

## Automated regression checks

Run the mapped `pnpm test:e2e:contextual-assistant` command with the exclusive
environment above. Playwright arguments after `--` filter only its browser
phase; the composed HTTP phase always runs. The real-browser tests check page
errors, unexpected request failures/500s, desktop/narrow rendering, and retain
traces/screenshots for failures.

```sh
node --test scripts/run-contextual-assistant-e2e.test.mjs
pnpm user-flow:e2e -- check contextual-language-assistant-and-knowledge
pnpm docs:user-flows:check
```

## Troubleshooting

A rejected environment is intentional: inspect host, exact target name, port,
database number, and confirmations. A database connection failure requires the
dedicated disposable infrastructure; never substitute the normal development
database. A 503 admission requires the fixture's seeded Flash configuration and
current worker capability observation. A busy local port must be released by
its owning task before rerunning. Model-tool/memory errors belong to SDK or
composition verification and must not be hidden by mocking internal services.

## Cleanup

The runner shuts down owned web/backend child processes. Fixture cleanup removes
only its random Redis namespace; synthetic PostgreSQL rows remain for diagnosis.
Stop the task-owned disposable containers after collecting evidence. Removing
those exclusive containers/data is optional and destructive; never run reset or
cleanup commands against shared, staging, production, or normal developer data.
