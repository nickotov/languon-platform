---
feature: texts
title: Texts folders and aligned reading
status: current
last_verified: 2026-10-21
surfaces:
    - api
    - system
    - browser
source_paths:
    - .agent/features/043-texts/**
    - .agent/features/050-sidebar-navigation/**
    - apps/backend/src/modules/texts/**
    - apps/backend/src/modules/dictionaries/application/text-selection-*.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/*text-selection*.ts
    - apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/selection-card-schema.ts
    - apps/backend/src/modules/dictionaries/interface/http/text-selection.routes.ts
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/infrastructure/text-ai/**
    - apps/backend/src/infrastructure/worker/**
    - apps/backend/src/modules/users/infrastructure/persistence/drizzle/**
    - apps/backend/src/app.ts
    - apps/backend/src/index.ts
    - apps/backend/drizzle/**
    - apps/backend/tests/integration/modules/texts/**
    - packages/contracts/src/texts/**
    - packages/prompts/src/local/texts.ts
    - scripts/run-texts-e2e.mjs
    - scripts/run-texts-web-e2e.mjs
    - scripts/run-texts-all-e2e.mjs
    - apps/backend/tests/support/texts-web-server.ts
    - apps/web/src/app/texts/**
    - apps/web/src/app/shared/texts/**
    - apps/web/src/app/shared/text-folders/**
    - apps/web/src/fsd/pages/texts/**
    - apps/web/src/fsd/features/text-reading/**
    - apps/web/src/fsd/features/text-management/**
    - apps/web/src/fsd/entities/texts/**
    - apps/web/src/fsd/widgets/app-shell/**
    - apps/web/src/fsd/shared/lib/capability-return.ts
    - apps/web/src/fsd/shared/i18n/messages/texts-*.ts
e2e_command: texts
e2e_tests:
    - apps/backend/tests/integration/modules/texts/texts.journeys.test.ts
    - apps/web/tests/e2e/texts.journeys.spec.ts
e2e_scenarios:
    - owner-translates-edits-and-collects
    - shared-reading-copy-and-revocation
    - web-owner-reading-and-collection
    - web-public-copy-and-revocation
    - web-phone-reading-selection
    - web-independent-text-membership
related_features:
    - sidebar-navigation
    - contextual-language-assistant-and-knowledge
    - dictionary-platform
    - user-ai-model-preferences-backend
    - ai-credit-wallet
    - profile-account-controls
---

# Texts folders and aligned reading

## What this verifies

The web Texts section organizes passages in optional flat folders and an
Independent texts block. The editor keeps desktop navigation available and
explicitly detects/confirms languages, translates
whole passages, saves drafts/proposals and edits paired sentences. Readers enable
matching, select contextual vocabulary into dictionaries, and share/copy saved
translations. Backend journeys also verify versioning, capacity and privacy.
The selected Magic Patterns source and control inventory live in feature 043
FEATURE.md/UI-01–UI-40 and DESIGN.md/v003.

## Start the development environment

Use only the dedicated loopback PostgreSQL port 55443 and database
`languon_auth_texts_ui_web_test`. Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`,
`AUTH_TEST_DATABASE_URL` to that local target and `AUTH_TEST_DATABASE_CONFIRM` to
that exact database name. Use Redis on loopback port 56443, database 1, with
`ALLOW_DISPOSABLE_REDIS_TESTS=true`, `AUTH_TEST_REDIS_URL` pointing to that target
and matching `AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56443/1` (or the equivalent localhost
host if used consistently). Combined verification rejects any other database/port
before invoking tests and requires local application ports 3335 and 4005 to be free.
Stop only your owned debug fixture processes first; do not stop unrelated services.

```sh
pnpm test:e2e:texts
pnpm user-flow:e2e -- check texts
pnpm docs:user-flows:check
```

The journey fixture uses real authentication, API routes, PostgreSQL/Redis and
production admission/credit infrastructure with deterministic model providers. It
resets only its confirmed disposable database and uses synthetic accounts. Do not
run another resetting suite against that target concurrently. No paid model calls
or shared/staging/production data are used.

## API verification

### Owner journey

1. Sign in as an active learner and create a named folder, optionally with a short
   description. List folders and open its text list.
2. Provide a nonblank source up to 20,000 Unicode code points, optional title, and
   distinct supported source/target languages. Explicit Save creates a draft.
3. Optionally submit language detection and poll its job. The result is advisory;
   the client must explicitly accept a suggestion and submit the chosen pair.
   The web source selector also offers Auto: selecting it accepts detection as the
   source-language choice in advance. Translate runs the existing detection job
   followed by translation with a resolved supported tag; `auto` is never an API
   language tag. Each stage retains its existing AI credit and capacity rules.
4. Submit translation with an operation ID and poll its durable job. The worker
   translates the complete submitted content, producing ordered source/translation
   arrays linked by stable pair IDs. Completion alone does not change the draft.
5. Save the returned proposal against the current text version. Paragraph whitespace
   and the complete source remain intact. Editing either side of a linked pair and
   saving marks its provenance edited-after-translation. A stale version conflicts.
6. Select a word/phrase within one sentence on either side. Its language direction
   determines eligible dictionaries. The request identifies exact UTF-16 offsets;
   the server derives the phrase and surrounding context from authorized content.
7. Add to an existing dictionary or supply a new dictionary name. Poll the durable
   collection job. On success, the generated full card and destination identities
   are returned. New dictionary/card/revision creation is atomic. Exact operation
   replay returns the same result; changed input under the same key conflicts.
   Collection requests canonical Source through the same dictionary authoring
   generator used by direct card authoring. Noun articles/gender and phrase grammar
   follow its existing language rules. Original occurrence offsets and surrounding
   sentences remain unchanged as context. Canonical Source duplicates require
   explicit confirmation even when the raw selection did not match an existing card.

### Shared reading and copying

1. Create a link for a saved translated text or a folder. Keep the secret in the
   client URL fragment and forward it only in `x-languon-share-key`; never put it in
   request paths or queries. Public responses are no-store/no-referrer/no-index.
2. Anonymous readers see translated active content. A shared folder is live and
   includes later saved translations and edits, but excludes untranslated drafts.
3. After signing in, copy one text independently or into an owned active folder, or copy the entire
   shared folder privately. Copies have independent IDs and editing/lifecycle.
   Collecting vocabulary requires an authenticated active learner and uses their
   own dictionary and AI credits.
4. Rotate/revoke the share or archive the source and retry the old capability.
   It becomes unavailable without revealing owner identity or existence details.
   Archiving a folder also hides its children. Restoring does not reactivate old
   sharing links. Previously completed copies and cards remain independent.

### Optional membership and stable addresses

Texts have an owner and zero or one folder. Create with `folderId: null` for an
independent text. A version-checked membership change preserves its ID, source,
translation, direct share and history. Moving into a shared folder requires an
explicit confirmation bound to the current share identity/version; its saved
translation becomes visible there, including a draft after future publication.
Moving out removes inherited folder access. Archived resources require restoration;
active AI work and stale versions reject a move without changing membership.

## Expected failure and edge cases

- Translation uses immutable task-specific limits. The reviewed DeepSeekFlash v2
  profile permits128000input/32768output tokens; dictionary calls remain8192output.
  No queued model/limit/pricing snapshot is rewritten. Overflow returns400
  model_capacity_exceeded before dispatch; incomplete/length-stopped output never
  publishes. Source limit remains20000Unicodecodepoints and is not a model-fit guarantee.

- Missing/inactive authentication rejects private mutations and AI work.
- Invalid languages, oversized input, unsupported selection and malformed mappings
  reject before publication. The 20,000-character input cap is distinct from the
  selected model’s complete-input/output limit; choose a suitable model or shorter
  text when preflight rejects the request. No implicit model switch/truncation.
- Insufficient credits, unavailable compatible workers/configuration, provider
  failure and rate limits return bounded safe codes. Existing saved text remains.
- Retry ambiguous HTTP admission with the same operation ID. Card creation must
  not be inferred from a timed-out request; poll the existing job.
- Known rate-limited provider work may retry within pinned attempt bounds; an
  unknown dispatched selection attempt is terminalized without blind publication.
- Cancellation and stale leases fence late completion. Source/destination edits,
  sharing revocation, archive or account deletion prevent pending publication.
- Duplicate vocabulary requires explicit confirmation. Folder copies are bounded
  at 500 visible translations; copy individual texts when that limit is exceeded.
- Temporary proposals expire after 24 hours. Save needed content before expiry;
  expired raw input/results are scrubbed while safe operation receipts remain.

## System verification

### Deployment boundary

Apply migration `0076_sidebar_navigation` before admitting independent texts.
It preserves existing folder memberships and permits null folder membership in
texts and Texts jobs. Independent detection uses `text-detection:v2`; independent
translation uses `text-translation:v3`. Deploy workers that understand both before
enabling those admissions, retaining legacy detection v1 and translation v1/v2
support for queued work. Include the new formats consistently in every API
admission/read/accept/cancel/discard vector and worker processable formats. Before
worker rollback, stop new admissions and drain independent-format jobs; a worker
that only understands folder-bound jobs is not a compatible rollback target.
This guide authorizes no production migration, activation or rollback.

Apply migration0068 before v2 admissions. Compatible workers must process
text-translation:v1 and text-translation:v2; v1 remains for queued work. In local
development addv2 to DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS. Do not append new
formats to API_ENQUEUED alone: every enqueued format must also appear in API
readable/acceptable/cancellable/discardable lists. Deployed releases update all
five API vectors consistently, start ready workers, then enable admission. Drain
v2 work before rolling workers back. Before selecting Flash as a shared default,
upgrade every shared AI worker to a build that knows Flash. Before rolling back
to a pre-Flash build, drain all Flash jobs (including dictionary/learning jobs)
and select a model supported by that build. Select the enabled DeepSeekFlash model for
the extended profile; legacy models keep their historical caps.

Canonical Source normalization also requires Source-aware selection workers before
new admissions. Older workers cannot complete Source-requesting jobs correctly even
though they advertise `text-selection-card:v1`; a format-only readiness observation
does not prove this build compatibility. Disable admissions, replace every old
selection worker, verify actual builds, then enable the new API. New workers retain
support for legacy queued input. Before worker rollback, disable admissions and drain
new Source-requesting jobs using Source-aware workers. Mixed-build rolling overlap
requires separately versioned capability and claim gating; this change does not
provide or authorize that deployment mode.

New AI admissions default off via `TEXTS_AI_ENABLED`. Activate only after the
existing expand/activate process proves API and rollback-floor worker compatibility
for `text-detection:v1`, `text-translation:v1`, and `text-selection-card:v1`.
Publish a compatible immutable AI configuration revision with those formats and
confirm fresh namespaced execution/capacity observations. Existing jobs retain their
pinned model/pricing; workers continue draining even when admission is disabled.
Apply reviewed worker/account-purge roles after migrations. This guide authorizes
no production activation. Backend startup does not automatically deploy changes.

## Browser verification

### Owner: saved aligned reading and contextual vocabulary

Scenario `texts/web-owner-reading-and-collection`:

1. Sign up and verify a synthetic local account. Open Texts, create a named folder,
   open it and choose Add text. Leave Source at Auto, choose Spanish as the target
   and enter an English passage. Choose a manual source only when overriding Auto.
   Folder items have separate spaced cards. Desktop icon actions expose their
   localized label on hover or keyboard focus; phone actions retain visible labels.
   Translate appears beneath populated source text, to the left of its character
   count. Empty source shows the sample action instead; there is no duplicate
   compose Translate action in the header, footer or translation pane.
2. Translate via AI, observe the complete unsaved preview, then explicitly Save.
   Auto detects English and submits translation with source language `en`.
   Unsupported/unknown or same-as-target detection stops with a recovery message.
   While either stage is active, inputs are locked and Cancel stops continuation.
   To save an untranslated draft, choose a manual source language; Auto does not
   start or charge for AI from Save draft.
   Reload the canonical saved text route; both sides remain visible in read mode.
   Missing target language shows a specific field error and red Select border;
   selecting a target clears both immediately. Source over 20,000 Unicode code
   points shows a shorten-text error and red textarea border; reducing it clears
   that field error immediately. No generic combined validation banner remains.
3. Enter Edit text, edit a paired source/translation block and Save changes.
   Reload and verify edited provenance and both persisted values.
4. Select one source occurrence, open Add to dictionary, name a new dictionary
   and explicitly Create and add. Observe processing and success with Open dictionary.
   The selection trigger follows the word. The dictionary panel remains inside the
   viewport when the window is shortened, and its fields remain clickable and
   keyboard-focusable inside the reader.
   The two-icon trigger has no unused minimum-width space around its controls.
5. Follow the toast link and verify the generated full card is persisted. Return
   to Texts and verify the real saved/translated folder count.
   Repeat with French Auto→Russian and select `but` from its containing sentence.
   The dictionary stores canonical `le but`, its contextual translation and all
   generated fields; the text occurrence remains unchanged. Card content retains
   16 px desktop and 12 px phone padding.

### Public reading, independent copy and revocation

Scenario `texts/web-public-copy-and-revocation`:

1. Owner uses the saved text menu Share text and Create link. The unlisted key
   remains in the URL fragment and request header, never query/server logs.
2. An anonymous browser reads the link with public header and matching controls.
   Copy to my folders requires actual sign-in; it does not fake authenticated state.
3. Another authenticated user copies into a newly named folder. Observe success
   and Open folder; the copied source/translation is saved independently.
4. Owner revokes through the share dialog confirmation. Reloading the public link
   gives the uniform unavailable state; the saved independent copy still reads.

### Independent texts, moves and navigation protection

Scenario `texts/web-independent-text-membership`:

1. From Texts choose New text. Independent texts is the global default; the
   Destination selector lists active folders and New folder creates a destination.
   Add text in a folder
   preselects that folder. Save an independent draft and reload its canonical
   `/texts/{textId}` address. Folders and Independent texts start expanded; the
   Active/Archived selector applies to both. New text is the primary header
   action and New folder is secondary; both have equal 44 px height on desktop
   and phone. The spaced section bars include a leading icon and disclosure
   chevron and support keyboard collapse/expand through native details controls.
2. Move the text into a folder through Text options. Its address and content stay
   unchanged. An old folder-based bookmark redirects to the canonical address.
   Remove it from the folder and verify it returns to Independent texts.
3. Create or move into a shared folder. Review and confirm inherited access, including
   future visibility after a draft is translated and saved. Direct text links
   remain valid after moving out. Copying into an existing shared folder requires
   the same explicit confirmation.
4. Make an unsaved edit and follow Home. Cancel the warning to retain the address
   and edit; confirm leaving to navigate. Search and browser history use the same
   unsaved-work protection.
5. Reopen the independent draft and Translate via AI. Reload before saving the
   completed proposal; recover the unsaved translation, then explicitly Save.
   Reload again and verify both aligned languages persist without a folder.

### Phone reading and selection

Scenario `texts/web-phone-reading-selection`:

1. At 390 px create/translate/explicitly save a passage. Source/Translation tabs
   replace squeezed columns; actions remain reachable.
   Source defaults to Auto: choose the target and translate without a manual
   detection-confirmation step.
2. Enable Match sentences and tap/focus a sentence. The counterpart sheet contains
   both language labels and previous/next/back controls.
3. Return to reading, select a word and collect it through the phone sheet into
   a new dictionary. Observe success and the persisted card.
   The initial collection trigger appears beside the selection rather than pinned
   to the bottom of the screen; opening it presents the phone sheet.
4. At 320 px verify no document overflow, clipped menus or hidden primary controls.
   Capture phone reading, counterpart and creation states. Console/page errors,
   failed requests and 5xx responses fail every journey.

## Related contextual assistant coverage

Owned and currently authorized shared texts expose **Ask about this**. The
[Contextual Language Assistant and Knowledge guide](contextual-language-assistant-and-knowledge.md)
owns private conversations, explicit use of unsaved source wording, durable
response reconnect and independent note publication. The translation, contextual
card collection and share/copy scenarios declared here retain their behavior;
they do not claim to test assistant publication.

## Automated regression checks

Run the registered `texts-backend` journey command with the disposable target
variables above. Use the contracts and backend unit suites for validation/provider
bounds, and the `tests/integration/modules/texts/` suites with separate disposable
databases for persistence, migration, account purge, roles and concurrency.

## E2E coverage

The combined registered command covers the existing backend scenarios and these
real browser scenarios in `apps/web/tests/e2e/texts.journeys.spec.ts`:

- `web-owner-reading-and-collection`: explicit proposal/save/edit and contextual card.
- `web-public-copy-and-revocation`: actual unlisted sharing, independent copy, revoke.
- `web-phone-reading-selection`: tabs/counterpart/collection at 390 px and 320 px.
- `web-independent-text-membership`: independent creation, stable bookmarks,
  membership changes, shared-folder confirmation, unsaved navigation and
  independent translation proposal recovery followed by explicit publication.

| Scenario                              | Test file                                                             | Outcome                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `owner-translates-edits-and-collects` | `apps/backend/tests/integration/modules/texts/texts.journeys.test.ts` | Authenticated draft, translation proposal, explicit save/edit and atomic contextual collection. |
| `shared-reading-copy-and-revocation`  | `apps/backend/tests/integration/modules/texts/texts.journeys.test.ts` | Anonymous shared read, private copy and live capability revocation.                             |

Repository, contract, provider and worker tests add exact source reconstruction,
version/concurrency, credit settlement, cleanup, role and purge coverage. Browser scenarios
add rendered desktop/mobile coverage and retained screenshots; source fidelity
evidence lives in the feature record.

## Troubleshooting

If the runner rejects the environment, correct the disposable database name,
loopback port and exact confirmation values; do not bypass its safeguards.
For unavailable AI admission, verify compatible configuration and fresh worker
observations with the new formats. A stale-version conflict requires reloading the
saved text or dictionary before retrying; retain the user’s unsaved content.

## Cleanup

The tests close clients and remove their own Redis namespaces. Stop/remove only
the disposable containers created for this verification; never remove development
volumes or another worker’s active test database.

## Combined fixture lifecycle and cleanup

The registered command runs guarded backend journeys first, then starts real
local web 3335/API 4005 processes for the browser journeys. Both ports must be free
before the command starts; it refuses debug-server reuse before any database reset.
It uses only the exact dedicated `languon_auth_texts_ui_web_test` database and a
unique Redis key prefix inside the confirmed local test DB. Existing development
containers and user data must not be used. External AI and email delivery are
replaced deterministically; real auth/session/HTTP/database/Redis/credits/jobs and
UI remain in the journey. No API interception or forced clicks substitute for UI.

The runner stops its owned fixture/web processes. Remove only explicitly labelled
Text UI disposable containers after the checks; preserve unrelated development
infrastructure. Screenshots/traces use ignored `.next/playwright/texts-results/`
run directories with synthetic data; do not publish bearer keys or auth traces.
