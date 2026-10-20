---
feature: knowledge-workspace
title: Knowledge workspace
status: current
last_verified: 2026-10-19
surfaces:
    - browser
    - api
source_paths:
    - .agent/features/047-knowledge-workspace/**
    - apps/backend/src/modules/knowledge/**
    - apps/backend/src/modules/conversations/**
    - apps/backend/drizzle/**
    - apps/backend/src/config/environment.ts
    - apps/web/src/fsd/pages/knowledge/**
    - apps/web/src/fsd/features/knowledge-notes/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - apps/web/src/fsd/entities/knowledge/**
    - apps/web/src/fsd/entities/conversation/**
    - packages/contracts/src/contextual-assistant.ts
    - packages/prompts/src/local/contextual-language-tutor.ts
    - scripts/run-contextual-assistant-e2e.mjs
e2e_command: contextual-assistant
e2e_tests:
    - apps/web/tests/e2e/knowledge-workspace.journeys.spec.ts
e2e_scenarios:
    - workspace-draft-chat-save-reopen
    - workspace-two-tab-conflict-recovery
    - workspace-restore-preserves-unsaved-branch
    - workspace-text-reference-limit
    - workspace-proposal-target-review
    - workspace-share-copy-revoke
    - workspace-mobile-tutor-sheet
related_features:
    - contextual-language-assistant-and-knowledge
---

# Knowledge workspace

## What this verifies

A learner can start research with an empty Knowledge draft, edit while chatting
with the existing language tutor, recover private working changes, and explicitly
Save a document. The tutor receives the complete current editor snapshot and
copied Text references within the configured limits. An unlisted reader sees
only the saved version and can make an independent copy after signing in.

The first version uses model knowledge and supplied learning material. It does
not fetch web pages or interpret linked media. Knowledge conversation history,
copied references and unpublished working branches remain private.

## Start the development environment

Use Node 24, pnpm, local PostgreSQL and Redis, and current migrations as
described in the root README. Set the optional sanitized
`KNOWLEDGE_REFERENCE_CHAR_LIMIT` and `KNOWLEDGE_EDITOR_CONTEXT_CHAR_LIMIT`
values; both default to 40000. Start the backend, worker and web app using the
README commands. Use only disposable test accounts and content.

The mapped deterministic suite uses the existing guarded contextual-assistant
runner. Its synthetic model boundary avoids paid calls while retaining the real
web, backend, PostgreSQL and Redis flows. Review its local-only guard and
startup/cleanup before execution. Its disposable targets are loopback PostgreSQL
port 55444, database `languon_auth_assistant_web_test`, and Redis port 56444,
database 1. The test runner requires all matching confirmation variables:

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true \
ALLOW_DISPOSABLE_REDIS_TESTS=true \
AUTH_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55444/languon_auth_assistant_web_test \
AUTH_TEST_DATABASE_CONFIRM=languon_auth_assistant_web_test \
AUTH_TEST_REDIS_URL=redis://127.0.0.1:56444/1 \
AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56444/1 \
pnpm test:e2e:contextual-assistant
```

## Browser verification

1. Sign in with a disposable account and select **New note** in Knowledge. An
   **Untitled** Draft opens with an empty rich editor and the language tutor on
   the right. Ask a question without writing in the editor. The first three
   words name the default note and chat. Start another chat; its history is
   separate and it does not rename the note. On a narrow viewport the tutor
   opens in a bottom sheet while the editor remains usable.
2. Type and format a document without selecting Save. Watch the recovery status
   change, then reopen the workspace in another tab. The unpublished wording
   is restored there. Make conflicting edits in both tabs; compare and retain
   either version, manually combine them, or save one as a separate note.
   Neither version disappears automatically.
3. Select text in the editor and ask a question. The question focuses on that
   selection while the complete editor content is available to the tutor.
   Type `/`, select multiple owned Texts, and explicitly include a translation
   when desired. Previews show the copied content. Editing or deleting an
   original Text later does not change its copied message content. An addition
   above the configured aggregate reference limit is rejected whole with the
   limit toast. An editor above its separate tutor limit remains editable but
   cannot be sent to the tutor until shortened.
4. Request an editor proposal. Review Insert at cursor, Append and Replace
   selection before accepting. Move the cursor and edit surrounding content
   during generation: the original target stays identified. If target wording
   changed, compare or select a new target before replacing it. Accepting a
   proposal changes the working draft as one undoable edit and does not publish.
5. Enter a title and body and select **Save**. The same note ID now has a saved
   version; the Knowledge library no longer marks it Draft. Edit again and
   select **Save a copy**. The copied note has its own ID and no conversation
   history; the original remains untouched.
6. Enable sharing, copy the unlisted link, and open it as a signed-out reader.
   The reader sees the last saved version only. Sign in as a second disposable
   learner and copy the shared note. The recipient can edit and chat in the
   independent copy. Disable sharing from the owner workspace: the original
   link fails immediately, while the recipient copy remains available. Enable
   sharing again and confirm the previous link stays invalid.

## API verification

1. Under owner authentication, create a Knowledge draft and read its workspace.
   Verify the stable note ID, status `draft`, empty working content, private
   branch and limits. A second account cannot read or edit that workspace.
2. Update the working branch with its expected version. Repeat from a stale
   version and verify the server returns a separate conflict branch while
   retaining both contents. Explicit Save with a nonempty title/body creates a
   published revision; empty body is rejected.
3. Issue a share locator/key, then read the shared note using the key header.
   Verify the response omits working branches and conversations. Copy it while
   authenticated as a different learner. Revoke the link and verify read/copy
   both fail, including after a new link is issued.
4. Submit a tutor turn with current `editorContext` and copied Text bodies. A
   request above either configured character limit fails before generation;
   exactly the limit is admitted if the complete model budget fits. Previous
   turn snapshots and copied references remain unchanged after later edits.

## E2E coverage

- `workspace-draft-chat-save-reopen` proves empty draft chat, working recovery,
  explicit publication and reopening across the real web/backend boundary.
- `workspace-two-tab-conflict-recovery` proves two stale browser tabs retain
  both recovered working versions until the learner explicitly resolves one.
- `workspace-restore-preserves-unsaved-branch` proves restoring an earlier
  revision keeps an unpublished branch visible and blocks publication until an
  explicit resolution.
- `workspace-text-reference-limit` proves the Text picker admits exactly
  40,000 copied characters and rejects the next reference as a whole with the
  actionable limit toast.
- `workspace-proposal-target-review` proves a persisted reply proposal can
  replace its original editor target, be undone, and requires comparison when
  that target changes before acceptance.
- `workspace-share-copy-revoke` proves saved-only shared reading, independent
  recipient copy and immediate link revocation.
- `workspace-mobile-tutor-sheet` proves the editor/tutor layout and usable
  mobile sheet at a narrow viewport.

Character boundaries, concurrent branch races, proposal target mapping and
model budget/compaction have focused contract, integration and editor tests.

## Expected failure and edge cases

- Saving requires a title and nonempty body. An empty research draft remains
  private and recoverable.
- If working recovery fails, show an error and retry without discarding local
  edits. A stale tab creates a conflict branch rather than overwriting work.
- A changed proposal target requires comparison or a new target before Replace.
- Invalid or revoked share credentials reveal no note or workspace content.
- Oversized copied references, editor context or complete model input fail with
  an actionable limit message; no paragraph is silently omitted.
- A new conversation contains neither another chat's history nor its copied
  attachments. Removing a chat does not delete the note.

## Automated regression checks

Run the registered `pnpm test:e2e:contextual-assistant` command above with its
disposable infrastructure. Run focused Knowledge and Conversations tests, then
affected contracts/backend/web typecheck, lint and build. Check mapping and
guide structure with `pnpm user-flow:e2e -- check knowledge-workspace` and
`pnpm docs:user-flows:check`.

## Troubleshooting

If the E2E runner refuses the environment, verify its exact loopback host,
port, database name and confirmation variables before retrying. A missing model
adapter or worker causes tutor turns to remain pending; use the deterministic
fixture command for repeatable tests. If a share link fails, check that its
fragment key was passed as the `X-Languon-Share-Key` header, rather than a query
parameter. Inspect recovery status and network failures before retrying an
editor Save.

## Cleanup

Delete only the synthetic notes and accounts created for local verification.
The guarded E2E runner owns its disposable service lifecycle. Any broader local
database reset is destructive and must target only a confirmed disposable
database; never run it against shared or production data.
