# Inline AI auto-accept and regeneration controls

Status: Planned — not implemented
Created: 2026-10-01
Updated: 2026-10-01
Backlog: [BL-001, original task 1](backlog.md#bl-001--streamlined-dictionary-editing)

## Summary and scope

Automatically apply successful inline AI results and save them for existing
dictionary entries, replacing the review controls with generation/regeneration
controls and whole-form version history.

This plan covers the inline Add/Edit editor only. Original task 2 (responsive
source/translation columns), advanced custom-instruction rewrite, batch
generation, document ingestion, and import reviews are separate and unchanged.

The intended delivery is a focused improvement using existing generation,
acceptance, update, and read contracts. Preserve backend ownership checks,
validation, optimistic concurrency, server-computed authorship/provenance,
persisted revisions, credit handling, and supported job formats. No new public
API, schema, migration, production dependency, or worker behaviour is planned.
Reclassify and obtain the required authorization if implementation cannot stay
within these boundaries.

## Agreed behaviour and acceptance requirements

### Applying and saving results

- Successful generation fills the affected inputs automatically. Remove inline
  Accept, Reject, Accept all, Reject all, and previous field-option pickers.
- For existing entries, automatically save the **complete visible form**, including
  manual draft edits made before generation. Keep the editor open after saving.
- For new entries, fill the draft but require explicit Create.
- While generating or automatically saving, disable field editing, context and
  field-setting changes, version navigation, Save/Create, and other AI actions.
  Generation cancellation remains available while generation is running.
- Manual edits after an automatic save remain unsaved until explicit Save or the
  next successful generation saves the complete form.
- Existing-entry dismissal must not undo automatic saves. Confirm dismissal when
  subsequent unsaved changes exist; use Close rather than wording implying that
  all changes can still be cancelled.

### Whole-form version history

- An existing entry starts at version 1. Its first successful generation preserves
  the pre-generation form and opens version 2.
- For a new entry, preserve the pre-generation form as version 1 only when at
  least one content field other than Source contains a non-whitespace value.
  The first result then opens version 2. If only Source is populated, the first
  successful result remains version 1.
- Content fields are Source, Translation, Transcription, Definition, Example,
  and Example translation. Translation context and field overrides do not count
  toward this first-version condition, but are included in form snapshots.
- Every subsequent successful generation appends a version, including a separate
  successful request that returns identical content. Failure and cancellation
  append no result version.
- History is local to the open editor session and disappears on close/reload.
  It is not the backend's immutable revision history.
- Selecting history previews a form snapshot only; it does not persist anything.
  Explicit Save restores the displayed snapshot for existing entries. Create
  creates the displayed snapshot for new entries.
- Generation is available only on the latest form version. Preserve existing
  historical editing behaviour before explicit restoration.
- Whole-form navigation is the only history UI; remove per-field option history.

### Controls and feedback

- Empty fields show Generate with the existing AI/Sparkles symbol.
- Populated fields show Regenerate with an AI/regeneration symbol, with an
  accessible action label identifying the field.
- Show one bulk action: Generate all when enabled non-Source fields are empty,
  otherwise Regenerate all. Do not expose both actions simultaneously.
- Show generation progress and, for existing entries, subsequent Saving and Saved
  feedback. For new entries, make clear that generated content still needs Create.
- Preserve keyboard access, focus handling, responsive behaviour, and all four
  supported locales: English, French, Spanish, and Russian.

## Repository baseline and constraints

The [dictionary user-flow guide](user-flows/dictionary-platform.md) and
[original inline AI feature](../.agent/features/031-inline-ai-field-generation/FEATURE.md)
describe review followed by explicit Save. This improvement deliberately changes
that inline behaviour, not the other authoring flows.

[Form versions](../.agent/improvements/dictionary-card-authoring-form-versions.md)
and [saved-card first-generation versions](../.agent/improvements/saved-card-source-normalization-versions.md)
already exist. Reuse their whole-form presentation, but change the draft lifecycle
to retain history across automatic saves.

Relevant web implementation seams:

- `apps/web/src/fsd/features/dictionary-card-authoring/hooks/use-card-authoring.ts`
  owns generation scope, Source-first application, and form orchestration.
- `apps/web/src/fsd/features/dictionary-card-authoring/hooks/use-card-draft.ts`
  and `lib/card-draft-versions.ts` own local snapshots and dirty state.
- `apps/web/src/fsd/widgets/dictionary-editor/hooks/use-authoring-job.ts`
  polls generation jobs; repeated review results must not apply twice.
- Widget `use-authoring-mutation.ts`, `use-card-mutation.ts`,
  `use-authoring-cleanup.ts`, and `use-draft-dismissal.ts` own acceptance,
  persistence, cleanup, and dismissal. Their current successful mutations close
  the editor, which automatic saves must not do.
- `apps/web/src/fsd/widgets/dictionary-editor/ui/editor-card-sheet/editor-card-sheet.tsx`
  connects form submission to acceptance or ordinary create/update.

Keep FSD ownership: draft/application rules stay in the authoring feature;
persistence and editor-session coordination stay in the dictionary-editor widget.
Do not introduce application-to-application imports or put HTTP orchestration
inside the form hook.

Translation generation affects every enabled non-Source field. Example generation
also affects its enabled paired translation. Whole-form generation normalizes
Source before dependent values. Preserve dependency compatibility, effective
translation context, enabled fields, and unchanged-result handling.

Acceptance currently requires at least one selected suggestion, validates exact
candidate values and Source basis, and checks the generation-time translation
context. Its outcome contains identifiers/versions, not the complete canonical
card. Accepted jobs are redacted and cannot be reused as mutable proposals.
Retry idempotency requires the same job and immutable candidate payload.

New-entry cumulative proposals are bounded: six suggestions per field and 24
excluded-history values per field. Removing review controls must not leave
obsolete alternatives consuming those bounds indefinitely.

Accepted ADRs remain constraints; consult the [ADR index](adr/README.md), especially
0011 (dictionary persistence/provenance), 0012 (durable authoring jobs), 0016
(real-app verification), 0017 (UI tokens), 0021 (model catalog), and 0022 (credits).
Recheck this baseline before implementation rather than treating paths and
observations as permanent contracts.

## Implementation sequence

### 1. Separate explicit submission from automatic persistence

Introduce an internal automatic-save callback distinct from explicit `onSave`.
It receives the complete candidate form plus generation job identity, format,
and selected suggestion references, and returns the existing canonical
`DictionaryCardResponse` shape after persistence/readback.

Keep explicit submission tied to the displayed snapshot and its own provenance.
Do not implement worker-side auto-accept: that would change backend contracts and
would not have the full visible client draft containing manual edits.

### 2. Apply a result atomically and create its form version

Extract a testable application helper rather than further expanding the already
large authoring hook. Capture the request-time full draft, context/settings,
previous suggestion IDs, and generation scope.

Apply only the current request's results, Source first, then compatible dependent
fields. Preserve unaffected and disabled fields, context, and manual draft edits.
Retain suggestion references internally for backend provenance even though their
review UI disappears; remove references invalidated by manual/source changes.

Use generation job identity as the once-only application guard. Suggestion-ID or
content equality alone is insufficient: polling and React effect replay must
not append duplicates, but two successful requests with identical content must
still produce separate versions.

For new drafts, automatically prune obsolete unselected proposal alternatives
without discarding references required by retained snapshots. Keep local form
history separate from cumulative backend proposal limits. Preserve those limits
and show actionable feedback if retained references prevent further generation;
do not silently drop restorable history or raise backend budgets.

### 3. Save existing entries without closing or resetting history

Accept generated selections using existing authoring contracts, then read the
canonical card with the existing card-read API. Update query caches and the
persisted baseline while keeping the editor open.

Make draft initialization session-aware: the current card/settings-version reset
key would erase history after every automatic save. Rebase the successful latest
snapshot with canonical values and versions without resetting the session.
Dirty state must compare the **displayed snapshot** to the persisted baseline,
not consider the form clean merely because some historical snapshot matches it.

After a saved-entry automatic save, start the next generation as a fresh update
job using current card/dictionary/settings versions. Never chain through a
redacted accepted proposal.

Restoring a historical saved-entry snapshot uses ordinary update with current
optimistic versions; do not reaccept an already accepted job with another payload.
Preserve existing server-computed authorship rules for that update.

Creating a historical new-entry snapshot uses that snapshot's own still-reviewable
job, format, and selections. If it has no selected AI suggestions, use ordinary
create. Cleanup must retain reviewable jobs needed by local history until they
are no longer needed or the session ends.

### 4. Make failure, retry, and dismissal semantics explicit

Represent generation, application, persistence, and canonical refresh separately.

- Generation failure/cancellation leaves preceding content intact, appends no
  successful result version, and performs no automatic persistence.
- An invalid complete candidate remains visible and unsaved with validation
  feedback. Let the user correct it and explicitly Save/Create.
- A definitive save failure retains the generated draft and clearly marks it
  unsaved. Retry persistence, not paid generation.
- For uncertain acceptance outcomes, freeze the immutable candidate and recover
  by reading job state or retrying the same job/payload. Do not allow edits to
  turn an ambiguous retry into a different acceptance request.
- If acceptance succeeded but canonical readback failed, report Saved, refresh
  failed. Retry the read; do not recreate the entry or resubmit changed content.
- On optimistic conflicts, preserve the draft and require explicit reload or
  resolution. Do not silently merge or overwrite newer server content.
- A Source-only unchanged response may contain no selected suggestions, so it
  cannot go through an acceptance contract requiring selections. If valid manual
  changes need saving, use ordinary update; otherwise avoid a meaningless write,
  clean up the unused proposal, and show no-change feedback. Do not invent IDs.
- Guard callbacks by editor-session identity so closing/switching entries cannot
  apply late results to a different draft. Session teardown must not discard
  accepted jobs. Preserve bounded cancellation/cleanup retries.

### 5. Replace controls and update localized feedback

Use existing shared Field/Button components, UI tokens, and Lucide icons. Remove
review/option UI only in the inline editor, retain whole-form version arrows, and
render automatic results back into normal inputs. Update help text that currently
claims nothing is filled until Accept/Save, plus action, progress, failure, and
dismissal copy in all supported locales.

## Verification plan for implementation

### Focused automated coverage

Update `apps/web/tests/dictionary-card-authoring.test.tsx` and add bounded editor
coordinator tests where persistence/session behaviour needs its own seam. Cover:

- Empty/populated field and bulk labels; removed review and option controls.
- Atomic Source-first application, dependent scopes, and unaffected/disabled values.
- Existing-entry initial version 2; both new-entry first-generation rules;
  subsequent requests, identical results, and failed/cancelled requests.
- Explicit new-entry Create and existing-entry full-form automatic saving,
  including prior manual edits and remaining open after success.
- History surviving automatic saves; next generation using current versions;
  preview causing no write; explicit restoration and historical Create using
  the displayed snapshot's correct provenance.
- Once-only application under polling/effect replay; immutable acceptance retries;
  definitive failure, uncertain outcome, failed readback, invalid candidates,
  conflicts, and late completion after session replacement.
- Dirty state relative to the active snapshot and latest persisted baseline;
  cleanup retaining required reviewable jobs and excluding accepted jobs.

Run affected web unit tests, lint, typecheck, and production build. Keep existing
advanced rewrite, legacy job-format compatibility, backend validation, and
idempotency coverage green. Tests must use deterministic fakes, never paid models.

### Mapped E2E and real-browser verification

Update the two affected stable scenarios in
`apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`:

- `inline-ai-card-authoring-preserves-field-choices`
- `saved-card-inline-ai-authoring-preserves-advanced-rewrite`

Preserve scenario IDs while changing assertions/titles to match the new flow.
Verify new drafts fill without creating, existing entries persist automatically
and remain open, multiple generations preserve history/current versions,
historical navigation causes no write, explicit restoration persists, reload
shows the saved card, and advanced rewrite remains unchanged.

Run the selected mapped journeys with the project's deterministic full-stack
configuration and dedicated disposable `AUTH_E2E_DATABASE_URL` and
`AUTH_E2E_REDIS_URL`. Resolve exact command selection first; do not accidentally
run the whole document-ingestion suite or use shared infrastructure.

Use the project-pinned browser-verification wrapper for desktop and 320px-width
checks, keyboard access, 200% text scaling, progress/failure feedback, and console/
request errors. Check localized controls and representative longer labels in all
four locales. Real rendered evidence is required by ADR-0016, not replaced by
compilation or mocks.

Update the dictionary user-flow guide and mapped revision markers, then run:

```sh
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check dictionary-platform
```

## Delivery records and completion

When implementation starts, create
`.agent/improvements/inline-ai-auto-accept.md` with acceptance, progress, scoped
commands, evidence, review decisions, remaining risks, and rollback notes.
This document is a plan, not that implementation record or verification evidence.

Update BL-001 to track original task 1 separately from task 2; completion of this
improvement must not mark responsive columns complete. Keep guides and tests
synchronized with implemented behaviour.

After author preflight, obtain one independent correctness/coverage review focused
on automatic-save recovery, history, provenance, and session races. A separate
tester is required only if the repository's substantial-harness, unresolved
infrastructure/concurrency, or complex-journey triggers apply. Remediate material
findings and rerun affected checks before recording completion.

Use the current branch for the focused improvement. Inspect the final scoped diff
and record actual evidence; do not commit, merge, or push automatically.
