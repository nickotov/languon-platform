# Improvement: Compact card-authoring controls and reliable generation

Status: Complete
Created: 2026-10-25
Updated: 2026-10-25

## Routing and scope

User requests fixes to existing EditorCardSheet generation and field presentation.
One cohesive authoring surface; focused UX improvement with investigation of an
existing provider failure. No new capability, API, persistence or billing policy.
Escalate only if diagnosis requires crossing those boundaries. Work on current
branch; no automatic commit authorized.

## Acceptance

- AC1: Field and whole-form AI generation controls are icon-only, retain specific
  accessible names, and show existing desktop hover/keyboard tooltips.
- AC2: Source/Translation labels omit language names. Field label/action rows never
  wrap; the button stays fixed-size and long labels truncate with ellipsis. Keep
  correct input lang/dir, validation and keyboard behavior, including narrow screens.
- AC3: Identify the reported card-authoring:v3 provider_unavailable cause and fix an
  evidenced existing bug. Preserve failure recovery/drafts and financial controls.
- AC4: Relevant authoring tests, deterministic real browser authoring and static
  checks pass; evidence states live-provider limits honestly.

## Plan and test strategy

Inspect existing controls/providers and sanitized local job metadata/logs. Reproduce
backend cause with a deterministic regression before correcting. Reuse shared
IconButton/Tooltip/Field and app tokens; changes remain scoped to card authoring.
Run focused authoring/button/field unit tests, web/backend affected type/lint checks,
and the existing inline card-authoring Playwright journey with owned disposable
PostgreSQL/Redis and deterministic model. Update dictionary guide/revision markers.
No paid requests or normal development DB mutations/restarts. Independent review
when provider/admission diagnosis establishes a meaningful boundary risk.

## Context

ADRs0016/0029; dictionary-platform guide, prior inline-ai-auto-accept and dictionary-
word-pair-columns improvement records. Existing field components exceed250 lines;
this patch only removes label assembly and replaces controls, no unrelated refactor.
Root owns web/UI/docs; card_generation_diagnosis owns backend generator fixes/tests.

## Evidence and remaining work

Base1583902. See implementation, reopening, and final evidence below.
Rollback is Git restoration of scoped source/presentation; no migration.

## Implementation and verification (2026-10-25)

- Reused IconButton/Tooltip for field and full-form AI actions. Source/Translation
  omit language suffixes; configurable optional fields retain their language and
  all inputs retain lang/dir. Label rows use minmax(0,1fr)/auto, ellipsis and fixed
  action sizes. Disabled authoring actions explicitly retain hover help through
  an opt-in IconButton prop; other callers retain existing behavior.
- Narrow/200% browser testing exposed intrinsic footer and underlying dictionary
  empty-screen overflow. Bounded supporting CSS fixes constrain the grid, allow
  text/button wrapping and let version counters fit beside navigation actions.
  The original document-wide overflow assertion remains unchanged.
- A real Mastra HTTP-adapter regression proved top-level maxOutputTokens was
  ignored in the pinned SDK. Moved output limit and zero retries under
  modelSettings; wire test now sees max_tokens=8192. Failures emit only an
  allowlisted error class, bounded HTTP status, transport code and validated UUID.
  No prompt, body, header, credential or raw error is logged/exposed.
- Two paid synthetic French→Russian diagnostics were explicitly authorized, with
  app system prompt/schema, under a $0.03 total cap. Both succeeded (2/2 requests
  consumed); estimated total provider cost $0.00137544, conservative uncached
  $0.0015636. No more live generation is authorized. Normal local data/settings,
  credits, provider accounting and services were not changed/restarted.

### Checks

- Web authoring/button unit tests: 87 passed, including icon accessibility,
  disabled hover help, language metadata and optional-field language selection.
- Backend generator/provider-failure focused tests: 12 passed. Includes real
  Mastra with fake HTTP adapter, token limit wire assertion and diagnostic leakage.
- Web/backend typecheck, affected ESLint, web style contract and diff whitespace
  checks pass. Dictionary user-flow mapping and guide validators pass.
- Deterministic Chromium journeys: 2 passed, no retries/skips, disposable owned
  PostgreSQL/Redis cleaned. Evidence:
  `test-results/card-authoring-controls/b6f92456-5b5c-4e62-812c-2560e8239025/`.
  Covers create/generate/version selection/save/reload, saved-card auto-save and
  advanced rewrite, desktop tooltip, 320px/200% row geometry and page overflow.
  Earlier red runs retained in adjacent evidence directories; overflow repaired,
  not waived. Temporary runner and model probes stayed outside tracked source.

### Independent review and disposition

Initial reviewer reviewed current patch against base1583902, including safe logging
and financial execution boundaries; no backend security findings.

- CR-01 Medium: optional language labels lost. Fixed: only Source/Translation are
  shortened; optional fields retain resolved language. Explicit nondefault-language
  regression added; existing optional-field selectors restored.
- CR-02 Medium: disabled icons lacked hover help. Fixed with default-false opt-in
  on IconButton; enabled only in authoring; disabled initial-state regression added.
- CR-03 Medium: original provider incident unproven. Limitation explicitly retained
  below; do not claim the historical error's cause was identified.
- CR-04 Medium: browser overflow. Fixed with bounded layout constraints; both
  journeys now pass with original overflow assertion retained.

### Initial incident limitation (superseded by reopened diagnosis below)

AC3 is only partially established: the historical provider_unavailable job failed
before retaining useful provider status; its cause remains unknown. The proven
missing token cap is fixed, but evidence does not link it to that 64ms attempt.
Both direct and full corrected-factory live requests succeeded. Runtime metadata
checks found configured key/model available and worker environment consistent.
The existing dictionary worker was started before the patch and does not watch;
reload normal development services to load it. If it repeats, the new safe
status/code diagnostic provides the next evidence. No speculative retry, billing
change, error masking, extra model call or normal-service restart was made.

Rollback: restore scoped source/CSS/tests/guide; no schema/data migration needed.
Final remediation review: no material findings. CR-01/02/04 closed; CR-03
limitation accepted. Reviewed patch hash
`8a9195e17d0db145c390b6879446c9b51257b9008b1037a12f548468ad60c417` against
base1583902, including the new files. Final formatting/docs/diff checks pass;
normal services and user data remain untouched; no commit performed.

At that handoff the record remained Partial. The next user reproduction below
provided the missing admission/routing evidence and supersedes that disposition.

## Reopened: repeated failure after worker reload

New job f20510b3-7a76-4cb8-bb1b-4e6f42a54f5d reproduced after user restart.
Read-only metadata plus an offline router replay now establish the cause:
claim-time action admission lowers the execution budget to 33748 input/8192
output; the router eagerly constructs every dictionary provider, including the
unused import-pairs provider. That factory requires 262144/40960 and throws before
card-authoring generation, outside the new agent diagnostic boundary. The worker
maps the generic exception to provider_unavailable. Original offline/live probes
used the full configured envelope and missed the admitted-budget seam.

Plan: lazily instantiate/cache each provider within its existing bounded routed
configuration, preserve snapshot validation and all per-request limits, and leave
batch-specific minimum validation in its own factory. Test the real router,
real Mastra and fake HTTP using the observed admitted limits and synthetic fr→ru
input. No new API, data, charging policy or permissions. Existing workflow
feature authorization covers the established behavior; no strategic change.
Regression must fail before the fix with the exact bounded-envelope error.
Run router/generator/worker tests and backend type/lint; independently review.
No additional paid calls are authorized by the earlier capped diagnostic approval.
Use read-only normal DB metadata and offline replay; no user data changes.
A routine reload of existing dev services applies the verified nonwatch-worker fix.

### Exact regression and correction

- RED `/tmp/card-router-red.log`: real routing path fails with the exact
  import-pairs minimum-envelope exception before any HTTP invocation.
- GREEN `/tmp/card-router-green2.log`: 36 tests across router, card-authoring
  generator, provider diagnostics and generation worker pass. Regression uses
  fr→ru synthetic input, observed 33748/8192 admission bounds, real Mastra, fake
  HTTP; asserts one call, max_tokens8192, validated result/usage and stable cached
  provider identity. Import-pairs and pasted-terms own minimum-envelope checks
  remain enforced when explicitly accessed.
- Backend typecheck, scoped ESLint, formatting and diff checks pass. No persistence,
  UI or public-contract change in this follow-up. Existing browser evidence remains
  valid for unchanged UI; real-router fake-provider test covers this backend seam.
- Root cause now confirmed by a minimized deterministic reproduction. Earlier
  provider-call-only diagnostics did not cover admission→router construction.

### Follow-up review and runtime application

Independent review found no code/security/cache defect in the router correction
(patch019e5b53d89ab494ad9e63435e253ebb7e5a3d72d5a4346fcddc180dfc5a9729).
CR-05 required the shared model/worker full critical gate; execution in progress
under `test-results/critical-flows/ea65ee4b-21a1-49ec-8348-b7935b448bae/`.
CR-06 required reconciling the earlier partial diagnosis: initial uncertainty is
retained as history, and the reopened section records the reproduced causal chain.

Reloaded the existing normal `pnpm dev:all` in its same Orca terminal after a clean
interrupt; confirmed configuration/runtime readiness started, app ready and
dictionary worker running. Infrastructure/user data were preserved; no generation
was submitted. Existing failed jobs are retained; retry creates a fresh action.

### Final verification and disposition

`pnpm test:e2e:critical` passed all eight registered flows, 13 executed tests,
zero skips/retries/flakes/unexpected failures. Evidence
`test-results/critical-flows/ea65ee4b-21a1-49ec-8348-b7935b448bae/summary.json`.
This closes CR-05; updated status/chronological diagnosis closes CR-06. No code
changed after the reviewed router patch, apart from test formatting. Final diff
whitespace, backend typecheck, scoped lint and formatting checks pass.

AC1/2/4 retain prior UI and browser evidence. AC3 is now satisfied for the user's
repeated incident by the exact failed-budget router reproduction, failing-then-
passing regression, and corrected default routing path. Original first-job logs
were insufficient; the confirmed repeated-incident cause supersedes that earlier
uncertainty. No additional paid request ran, so live-provider availability after
this change is not asserted. Existing services have been reloaded with the fix.
The user can retry; previously terminal jobs are not altered or retried silently.
No public contract, persistence, charging policy or data migration changed.
No commit was made. Rollback requires restoring the scoped router change and
reloading the worker; prior UI changes are independently reversible.
