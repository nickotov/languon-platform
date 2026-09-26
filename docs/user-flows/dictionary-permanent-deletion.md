---
feature: dictionary-permanent-deletion
title: Dictionary Permanent Deletion
status: current
last_verified: 2026-09-26
surfaces:
    - browser
    - api
    - system
source_paths:
    - .agent/features/030-dictionary-permanent-deletion/**
    - apps/backend/src/modules/dictionaries/**
    - apps/web/src/fsd/entities/dictionary/**
    - apps/web/src/fsd/features/dictionary-library/**
    - apps/web/src/fsd/features/dictionary-card-list/**
    - packages/contracts/src/dictionaries/**
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/dictionary-permanent-deletion.journeys.spec.ts
e2e_scenarios:
    - owner-deletes-selected-and-all-archived-dictionaries
    - owner-deletes-selected-and-all-archived-cards
    - stale-or-busy-deletion-preserves-content
related_features:
    - dictionary-platform
    - dictionary-pronunciation-audio
    - ai-credit-wallet
---

# Dictionary Permanent Deletion

## What this verifies

This guide verifies that a dictionary owner can irreversibly delete one, selected, or all archived dictionaries and cards. Selection and confirmation include records outside the loaded page or current search only through an exact server preview. Deletion removes learning content while preserving content-free provider and AI-credit accounting and tracked pronunciation-object cleanup.

Archive remains the reversible action. **Delete permanently** appears only for archived targets and has no restore path.

## Start the development environment

Start the normal disposable local PostgreSQL and Redis infrastructure, apply current migrations, then start the backend, web app, and dictionary worker with the commands registered in the repository command index. Use deterministic generation and pronunciation adapters. Do not contact paid providers for this journey.

Create a fresh synthetic owner account. Give it enough AI credits only if generation is used to prepare dependent records.

## Browser verification

1. Create three dictionaries. Add an active and an archived card to the first dictionary. Archive two dictionaries and leave one active.
2. Open **Archived** in the library. Confirm each archived row has a labelled checkbox and **Delete permanently** menu action, while active rows have neither control.
3. Start single-dictionary deletion. Confirm the alert dialog names the dictionary, explains that every card and generated item will be removed, and keeps the destructive button disabled until the exact dictionary name is entered. Cancel and confirm nothing changes.
4. Select archived dictionaries across loaded pages. Confirm the toolbar announces the selected count, can clear selection, and deletes only the selected set after the required typed phrase.
5. Use **Delete all archived dictionaries** with search text present. Confirm the dialog uses the server preview count for every archived dictionary, not only visible matches. After success, confirm the archived library is empty and announces the exact deleted count.
6. In the remaining active dictionary, switch cards to **Archived**. Repeat single, selected, and all-archived deletion. Confirm the card dialog identifies source and translation, bulk deletion requires acknowledgement, active cards remain, and the dictionary version/list refreshes.
7. Repeat relevant confirmation and selection steps by keyboard at desktop width and at 320 CSS pixels with browser text zoomed to 200%. Confirm focus stays inside the alert dialog, Escape closes only before submission, pending submission disables dismissal and duplicate submit, and no horizontal page overflow appears.

Expected result: deleted resources disappear immediately after the successful response, cannot be opened or restored, stale selection is cleared, and focus returns to a stable archived-view action.

## API verification

Read the dictionary or card deletion preview as the authenticated owner and record its exact count and opaque snapshot. Submit an all-archived command with that snapshot and a new `Idempotency-Key`; confirm the content-free receipt reports the correct target kind and deleted count. Replay the same key and body and confirm the same receipt. Reuse the key with another body and confirm a conflict.

Submit selected commands with unique target IDs and expected versions. Confirm empty/duplicate input is rejected at validation, foreign and missing identifiers use the established non-enumerating response, and active or stale targets return conflict without deleting any member of the set.

After taking a preview, archive or restore an item in another session, then submit the old all-archived snapshot. Confirm the command conflicts and deletes nothing. Read a fresh preview before retrying.

## System verification

Prepare completed dictionary generation, revision/proposal, import idempotency, cleaned document ingestion, and pronunciation audio records for archived targets in disposable infrastructure. Delete the target and verify:

- dictionary/card content, settings, revisions, proposals, completed generation payloads, document metadata, and share access are gone;
- create/fork/import retry records are payload-free and invalidated, so replay cannot recreate erased content;
- settled provider usage still contributes to its rolling limit and AI-credit ledger totals remain unchanged;
- pronunciation bindings are gone, job text is scrubbed, object inventory remains until the cleanup worker deletes every physical version, and then inventory reaches its terminal cleanup outcome;
- an independent fork still exists and no longer references the deleted source dictionary.

## Expected failure and edge cases

- Active dictionaries and cards never expose permanent-delete UI and API deletion rejects them.
- A dictionary deletion includes active child cards because the archived parent and confirmation define the deletion boundary.
- A selected set is atomic: one stale, restored, foreign, or missing target leaves every requested target intact.
- Nonterminal or unsettled generation work returns retryable `deletion_busy` without cancelling outside the established settlement path.
- Document upload capability or physical cleanup that is not terminal returns `deletion_busy`; object inventory is retained for retry.
- A failed network response preserves the dialog, typed confirmation/acknowledgement, and selection so the idempotent command can be retried.
- A successful API response never reports partial selected deletion. All-archived success reports the exact committed snapshot count.
- Deletion does not refund model usage or clear rolling provider limits.

## Automated regression checks

Run the mapped Playwright journey, focused contracts/backend/web tests, disposable PostgreSQL integration tests, migration checks, affected lint/typecheck/build commands, `pnpm docs:user-flows:check`, and `pnpm user-flow:e2e -- check dictionary-permanent-deletion`.

## Troubleshooting

If deletion reports busy, let the dictionary worker finish or cancel work through the existing generation UI, and wait for document capability/object cleanup to complete before retrying. If an all-archived command conflicts, reload the archived view and open a new confirmation so it uses a fresh preview. If audio remains temporarily after logical deletion, inspect the existing pronunciation cleanup queue; do not delete its inventory row manually.

## Cleanup

Stop disposable application processes and remove only the synthetic test database, Redis namespace, and test object-storage namespace. Never exercise permanent deletion against shared or production-like data for verification.

## E2E coverage

- `owner-deletes-selected-and-all-archived-dictionaries` proves archived-only controls, cancelled single confirmation, selected atomic deletion, search-independent all-archived preview/deletion, and inaccessible former dictionary URLs.
- `owner-deletes-selected-and-all-archived-cards` proves single/selected/all card deletion preserves active cards and refreshes the parent dictionary.
- `stale-or-busy-deletion-preserves-content` proves a stale preview or unsafe dependent job returns a recoverable result and leaves the full target set intact.

Provider-budget union accounting, import replay invalidation, document capability expiry, object-version cleanup, and concurrency interleavings remain at focused disposable PostgreSQL layers where the exact rows and transaction boundaries can be asserted deterministically.
