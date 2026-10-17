# Improvement: Texts language and dictionary normalization

Status: Complete
Created: 2026-10-17
Updated: 2026-10-17

## Routing decision

Focused existing-contract UX improvement and regression repair. Compose the existing
language-detection and translation jobs automatically when the learner selects Auto;
reuse the existing dictionary Source normalization requested-field semantics for text
collection. No new endpoint, public contract, persisted concept/schema, permission,
production dependency, credit policy or deployment. Existing detect→translate and
collect→dictionary journeys remain the same journeys, with fewer manual language
steps and correct existing lexical normalization. Selecting Auto is the learner's
advance choice to use the detected source language; manual selection remains.
No new backend autodetection-in-translation capability is authorized by this routing.
Escalate before any public-contract/persistence or billing-policy change.

Preserve all prior uncommitted UI work from completed
[texts-ui-and-shared-popovers.md](texts-ui-and-shared-popovers.md). Base HEAD0e07c3c;
that record identifies the prior patch. Current task touches only scoped follow-ups.
No commits, branches, merge, push or deployment under this improvement workflow.

## Acceptance criteria

- AC-1: DictionaryCardRow retains responsive16/12 padding regardless CSS order.
- AC-2: Two-icon selection toolbar uses intrinsic width; full collection panel and
  validation messages remain bounded and readable on desktop/mobile.
- AC-3: Text collection uses the same authoring generator/prompt and noun article/
  gender/lemma rules as direct dictionary authoring. Original selected occurrence
  and sentence context remain unchanged; canonical Source is saved with all fields,
  duplicate checks, authorship/revisions, legacy queued-job compatibility and cleanup.
- AC-4: New text defaults to localized Auto source (RU: Определить автоматически).
  Choosing target and Translate automatically detects then translates with the
  resolved supported language. Explicit source override remains available.
- AC-5: Unknown/unsupported or same-target source stops safely with a useful error;
  no wrong-language translation. Edits/account/source/target changes and cancel fence
  stale detection/translation continuations. Auto never leaks into API language tags.
- AC-6: Saving untranslated drafts remains available with a manual language; Auto
  does not silently charge for AI on Save. Proposal saving uses its resolved language.

## Implementation and verification plan

Use frontend-development/UI composition, testing and browser-verification; backend
DDD and existing shared authoring interfaces remain authoritative. Related ADRs:
0016 runtime evidence,0029 CSS tokens/modules, existing Texts/AI-credit boundaries.
Existing user-flow guides: texts, dictionary authoring/normalization relevant mapping.

UI worker owns only row padding and selection-toolbar CSS. Article worker owns bounded
canonical Source request/consumption and prompt clarification plus focused tests.
Root owns language orchestration/UI integration, documentation and verification.
Use scoped unit/contract tests for orchestration and normalized Source; real disposable
DB tests for canonical duplicate/persistence/cleanup; deterministic maintained real-app
browser journey for Auto translate/save, collection article and CSS geometry. No paid AI.
Independent completion review after author preflight (shared async/persistence risks).
Security review only if a trust-policy surface materially changes; model output remains
validated by the existing shared delta schema and source/selection authority is unchanged.

## Discovery

Card padding currently competes with shared Card padding=none at equal specificity;
move feature spacing to its own content wrapper. Selection toolbar inherits shared
popover min-width160; override intrinsic toolbar sizing in owned CSS.
TextSelectionWorker already calls routedProviders.cardAuthoring. selectionProviderInput
omits Source and selectionCardValues hardcodes original raw selection; shared prompt
already defines correct article/gender/phrase behavior. Stored provider output supports
Source suggested/unchanged, so no schema addition or heuristic article rule is needed.

## Evidence and review

Completed evidence and independent review are recorded below.

## Remaining risks / rollback

Auto has two existing AI stages; cancellation, input/account fencing, unsupported/same
language and saving before detection need explicit checks. Canonical Source can collide
with existing card even when raw selected phrase does not; verify canonical duplicate
confirmation atomically. Legacy queued selections without Source requested retain prior
behavior. Rollback is the scoped patch; no schema/data migration or runtime rollout.

## Author preflight progress

Implementation is frozen. Padding moved to owned row content (16/12), shared Card
unchanged. The selection toolbar now receives both owning CSS classes so its intrinsic
width override actually outranks the shared minimum; full panel dimensions unchanged.
Auto composes existing jobs, caches the resolved tag for retries of unchanged input,
fences edits/session/unmount/cancel, exposes pending work as active, and persists the
proposal's resolved language. Auto Save draft is disabled and guarded in the save hook.
Four locales include Auto/hints and unknown/same-target recovery; manual mode remains.
No API language schema accepts or receives `auto`.

Dictionary collection requests Source from the existing authoring generator with the
same contextual input. Canonical duplicate validation shares the existing guarded
terminal path, preserving actual provider usage settlement. Legacy leases without
requested Source retain the raw selected value; no stored immutable input is rewritten.
Agent ID/composition/SDK/schema and registered Mastra primitive are unchanged; the
occurrence instruction only clarifies existing authoring normalization semantics.
No new Studio operation or registration/policy is introduced.

Checks so far: web84files/671tests plus proxy test pass; backend116unitfiles/962tests
pass; backend20 focused normalization/provider units and12 real PostgreSQL persistence
checks pass. Web/backend typechecks, web full lint/styles and scoped backend lint pass.
UI row Storybook proves16 desktop/12phone pixels with no browser errors. Browser Auto
owner/shared paths, resolved API tags, canonical le but and toolbar/card geometry pass;
last phone check hit the synthetic shared-IP fixture rate budget, not a product failure.
Tester is rerunning the mapped combined command with a bounded real-Redis test-only
texts-public limit600 (production120 unchanged, same subject/window, other policies
unchanged); no rate failure is ignored or production limiter altered.

Broader optional backend `pnpm --filter @languon/backend test` reported971 tests passing
but one existing migration-suite collection failure: the skipped suite constructs its
Postgres client without required disposable env. No development DB was contacted. The
explicit116-file unit run above is green; affected real DB and mapped HTTP journeys
use separately confirmed disposable targets. This unrelated harness defect is not
changed by this scoped improvement.

Guide texts retains existing scenario IDs; current revision fbd0e8e112ae50a4 maps API
and browser tests. Only existing Texts behavior changes; dictionary-platform's existing
normalization rules remain authoritative and its guide needs no behavior change.
Independent async/persistence completion review is required before handoff. Build,
final mapped browser/runtime, fixture cleanup and final record closure pending.

## Maintained combined browser verification — 2026-10-17

The registered `node scripts/run-texts-all-e2e.mjs` runner passed **5/5 API journeys and 3/3 real Chromium journeys** with `AUTH_E2E_RUN_ID=texts-language-final-3`. API duration was 4.10s (2.81s tests); browser duration was 35.5s (owner 16.7s, sharing 7.7s, phone 6.4s). Guide marker `sha256:fbd0e8e112ae50a4` and `pnpm user-flow:e2e -- check texts` pass. Backend typecheck, ESLint and Prettier for the two maintained fixture/spec files, and their focused `git diff --check` pass.

Evidence covers default Source language Auto while choosing only Spanish target, visible Detecting… without premature preview, actual translation POST with resolved `sourceLanguage: en`, save/navigation/reload, existing explicit French large-text API path, contextual river-bank collection, sharing/copy/revoke, and French `Le but de cette visite est clair.` Auto → Russian. The French fixture retains raw selected `but`, offsets 3–6, and exact sentence context; the same production shared generator consumes the Source result and persists/reloads **le but**, Russian translation, French definition, French example, and Russian example translation. Screenshots live under `apps/web/.next/playwright/texts-results/texts-language-final-3/`, including `owner-french-canonical-source-card.png`, `phone-persisted-card-padding.png`, and `phone-320-collection-panel.png` in their journey directories.

DOM geometry verifies the selection toolbar equals its actual two button widths plus their nearest common container gap and outer padding/borders within 2px; the former shared 160px minimum would fail. Persisted dictionary row content measures at least 16px padding on desktop and 12px on phone. Collection panels remain bounded at 320px and 390px, with no horizontal overflow. Existing console/page-error and unexpected failed-request assertions remain enabled and pass.

Isolation: labelled task-owned PostgreSQL container `languon-texts-language-browser-postgres` used only `127.0.0.1:55443/languon_auth_texts_ui_web_test`; labelled Redis `languon-texts-language-browser-redis` used only `127.0.0.1:56443/1`. The browser fixture delegates to the real Redis rate limiter with a bounded **600 requests/minute texts-public localhost suite budget**, because the three synthetic journeys share one address and exhausted the production 120/minute IP bucket. Per-user 180/minute and every other limit remain unchanged; production source limits are untouched. An intermediate run correctly surfaced 429; no errors are suppressed. Both verified task-owned containers were removed after the final pass; development PostgreSQL 5432 and Redis 6379 were untouched. No paid/model provider is called.

Source was frozen throughout the successful combined run. SHA-256 checks before/after passed for the fixture, browser spec, dictionary selection service/worker/domain, Auto/workspace hooks, collection layer, reading CSS and card CSS. Fixture fingerprint: `c2ef5bddc5f0246d402361353b6e39e55b48f2d1588e3c6c3dc7b3eac12a0f4f`; browser spec: `6b42f13a25786f9dc18e114949df2751e7b285967b8c8031c4ea196dbb00f252`. No remaining browser verification gap for this scope.

## Isolated dictionary spacing evidence — 2026-10-17

The UI worker changed only
`dictionary-card-row.tsx`, `dictionary-card-list-common.module.css`, and
`text-reading.module.css`. Row padding previously competed with the shared
Card's `padding='none'` at equal specificity. The owned `.cardContent` wrapper
now carries responsive padding; shared Card remains unchanged. The selection
popover inherited the shared 160px minimum; `.popover.triggerPopover` now uses
`width: max-content` and `min-width: 0`, with both owning classes supplied by the
collection layer. Full collection panel sizing is preserved.

The approved browser wrapper inspected the real existing Storybook story at
`http://localhost:6006/iframe.html?id=dictionary-ordered-card-list--default`
(Storybook 10.5.8), using task session
`languon-ui-spacing-cards-3a6090e446ccf038973ab51ef09706c0`. Computed
`.cardContent` padding measured 16px on all sides at the default desktop viewport
and 12px on all sides at 390×844. The card actions button had an accessible name;
`errors` was empty, console contained only Vite/React DevTools informational
messages, and inspected resource requests were localhost HTTP 200. The session
was closed after inspection. Four focused existing test files passed 26 tests
(dictionary audio and Texts reading view/collection/selection); scoped row ESLint
and the web style contract passed. The maintained combined browser run above
provides final integrated toolbar and persisted-card geometry evidence.

Cleanup: stopped the worker's own Storybook launch through its retained process
session `63915`; it exited successfully. Subsequent checks found no listener on
6006 and no remaining PID 57650. App 3333, backend 4000, and development databases
were not touched.

## Independent initial completion review — 2026-10-17

Reviewer: independent `language_article_review_sol` agent, after author preflight
and the frozen final combined API/browser run. **Verdict: Approve; no material
findings.** No implementation edits were made by this reviewer. This review
covers the focused improvement and affected execution paths, preserving the
previously independently approved UI patch rather than repeating its formatting
review.

Reviewed-source manifest: `/private/tmp/languon-language-initial-review-source-manifest.txt`
contains SHA-256 values for all 30 current source/test/guide files differing from
the prior approved remediation manifest. Manifest SHA-256:
`71efea6775a1c579de6a3a2badd4695b1e73f3d9c24d60d5de05b42b65906571`.
The final fixture/spec fingerprints match the frozen successful runtime evidence
above. Generated Next.js declarations and work records are excluded from this
source manifest.

Review inspected Auto admission/polling, generation fencing, cancellation and late
responses, actor/session and input changes, retry operation identity, supported/null/
same-target detection results, explicit override, save/draft/close behavior, and
resolved proposal-language persistence. Auto remains frontend state and cannot
reach translation/persistence language tags. Save Draft does not initiate detection.
Existing authoring validation checks requested Source results and complete card
fields; original occurrence input remains unchanged. Completion rechecks canonical
duplicates under the existing transaction locks, settles actual reported provider
usage on canonical-duplicate failure, and retains authorship/revision provenance.
Legacy queued input without requested Source continues to accept its original DTO.

Reviewed row wrapper ownership and both-class collection CSS selector matching,
localized copy in all four supported UI languages, maintained guide/E2E revision
mapping, fixture assertions, and frozen runtime geometry evidence. The test fixture's
600/minute override is acceptable: it applies only to the synthetic shared-IP
`texts-public` scope at test composition, delegates to real Redis with its original
scope/subject/window, preserves other scopes and production 120/minute behavior,
and keeps 429/error assertions active. It is not evidence of a production rate-limit
change or of bypassing rate-limit behavior.

Independent verification: `pnpm --filter @languon/web exec vitest run
 tests/texts-workspace-auto.test.tsx tests/texts-workspace-content.test.ts
 tests/texts-workspace-error-recovery.test.tsx` passed **19/19 tests in 3 files**;
root `git diff --check` passed. Reviewed author/tester evidence additionally includes
671 web tests, 962 backend unit tests, focused unit/real PostgreSQL tests, final
5/5 API and 3/3 real Chromium journeys, scoped lint/type/style checks, and isolated
Storybook/runtime spacing evidence. The unrelated optional broad backend command's
unconfigured migration-suite collection failure is documented and does not
invalidate the focused disposable-database evidence. Production build outcome is
owned by the coordinator and was still running when this review was recorded;
completion of those builds remains part of final author handoff.

### Compatibility qualification after targeted follow-up — 2026-10-17

**Medium operational compatibility finding; no production activation authorized.**
The earlier approval covers one coordinated current-build API/worker installation
and new-worker processing of legacy queued inputs. It does **not** establish
old-worker compatibility with newly admitted Source-requesting jobs or safe rolling
overlap. Production builds subsequently passed according to coordinator evidence.

Location: `selectionProviderInput` / `selectionCardValues` in
`apps/backend/src/modules/dictionaries/domain/text-selection.ts`; admission/claim in
`drizzle-text-selection-store.ts`; worker selection enablement in
`apps/backend/src/infrastructure/worker/dictionary-worker-command.ts`.
Old HEAD completion requires a `delta.suggestions` value for every requested field.
New jobs include `source` in `requestedFields`, but the existing authoring contract
returns it through the separate `sourceResult`. Consequently an old worker can
claim a new `text-selection-card:v1` job, execute provider work, then fail completion
with `Missing requested vocabulary field` instead of publishing the requested card.
New-worker/old-input compatibility does not prove the reverse direction.

Current observations advertise `text-selection-card:v1`, not this Source-handling
build distinction. The admission participant accepts qualifying v1 observations;
selection claim does not filter Source-aware jobs against worker support; the
existing transaction guards require texts/accounting revision 1, which both builds
already advertise. Neither one fresh healthy worker nor the existing database guard
excludes an older selection worker from these jobs.

Minimal necessary operational boundary for this local improvement: disable Texts
AI admission (`TEXTS_AI_ENABLED=false` / the existing admission gate), stop every
old selection-capable process, upgrade/restart all workers that can reach this
queue, verify their actual build identity, then enable the new API's admissions.
API and worker must be the same reviewed build (or workers must already contain
this Source-aware completion fix). Legacy queued work may drain on the new build.
Before rollback, disable admissions and drain all newly admitted Source-requesting
jobs on Source-aware workers; do not return old workers while such jobs remain.
No deployment, admission toggle, migration, or rollout was performed by this review.

ADRs 0026/0035 require compatible worker support before admission and a supported
rollback floor. They do not state that every bugfix to an already allowed provider
input requires a format bump. ADR-0036's v2 decision specifically separates an
incompatible execution profile; its warning about relying on readiness applies
here too. The coordinated admission-off/all-workers-upgraded boundary satisfies
that ordering without asserting mixed-build safety. If future delivery requires
rolling overlap or cannot enforce complete exclusion of old workers, this source
patch alone is insufficient: add mechanically distinguishable job/capability
versioning **and** claim exclusion (typically a new selection format plus its
schema/activation/rollback work) under separately authorized scope. Documentation
alone is not a substitute for that mechanism in an overlapping deployment.

Final scoped verdict remains **Approve with this explicit operational limitation**.
No source remediation is necessary for the verified coordinated local current-build
configuration. Mixed-build production activation is not approved by this review.

## Verified completion — 2026-10-17

AC-1–AC-6 complete. Final mapped proof: 5 API +3 real Chromium journeys, desktop
and390/320phones, including exact toolbar dimensions, responsive card padding, Auto
English→Spanish and French→Russian, persisted `le but`, all generated card fields,
context/offset preservation, save/reload and existing share/copy/revoke behavior.
Independent review approves same-build local operation; no unresolved code findings.

Final automated evidence: web84files/671tests plus proxy Node test; backend116unit
files/962tests;20 focused normalization/provider units;12 real disposable PostgreSQL
checks; reviewer19 focused tests. Web/backend production builds pass, both typechecks,
full web lint/styles, scoped backend lint, source Prettier and diff checks pass.
New Auto hook received logical blank-line grouping and its test import was consolidated
after frozen browser proof; behavior/assertions unchanged, Auto9tests rerun green.
No runtime change invalidates the final combined proof.

Texts guide last_verified=2026-10-17; Auto/normalization and operational compatibility
are current. Final guide revision8f0b15e2ddb3f16f and both mapped revision markers
validate. After the successful combined run, only this coordinated-deployment prose
and marker acknowledgements changed; no executable assertion, fixture or runtime
policy changed. All22 guide mappings and16 guide-validator tests pass. Existing
dictionary-platform guide normalization behavior is unchanged.

Isolated web build output .next-texts-language-review preserves normal dev output;
Next declarations regenerated by AUTH_E2E_DIST_DIR=.next/dev next typegen, so tracked
next-env matches baseline. Dictionary worker PID16729 was gracefully stopped and
replaced with current-source PID87189; no old local worker remains. Canonical worker
healthcheck exits0. Local API/web remain on4000/3333; no paid test job was submitted.

Storybook and browser sessions closed; all task-owned55443/56443 and55444 containers
removed. Development data/infrastructure unchanged. No model/API contract/schema,
new dependency, credential artifact, immutable-design edit, commit, merge, push or
production deployment. Prior uncommitted UI work remains preserved.

Operational limitation: new Source-requesting v1 jobs require Source-aware workers.
Production mixed-build overlap is unsupported; use the admission-off/all-workers-
upgraded/drain-before-rollback procedure now recorded in the guide and review. This
is not a claim of rolling deployment safety. Optional whole-backend command still
has the pre-existing unconfigured skipped-migration-suite collection issue described
above; affected unit/database/API/browser/build checks all pass.

Rollback: revert this focused improvement, preserving earlier UI work; before any
worker rollback, drain Source-requesting jobs on the fixed worker as documented.
No schema or data migration is necessary.
