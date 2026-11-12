# Correction: Composer preferences in the input toolbar

Status: Complete
Created: 2026-11-12

## Routing and scope

One bounded presentation correction on the existing composer. User requested
ComposerPreferences inside the chat input area beside Context in the left action
group. Reuse the existing inputFrame/contextActions pattern under ADR0029/0016;
no new capability, setting, API, saved preference, security boundary, dependency,
layout abstraction or AI execution change. Use correction-development,
frontend-development, ui-ux-composition, testing and browser-verification.
Baselinea152f9d2 on improvement/assistant-chat-surface. The preceding surface is
accepted and committed. Do not merge/push or automatically commit this follow-up.

## Acceptance and plan before edits

- AC1: Both regular/source chat and worksheet place one existing settings trigger
  immediately after Context, before optional selection tools; inside inputFrame.
- AC2: Existing preferences/mode/default callbacks and disabled states, draft,
  submit/stop, context keyboard shortcut and focus behavior stay intact.
- AC3: Desktop row aligned; mobile controls fit and use44px touch targets.

Move the same component into contextActions; remove the obsolete outer preferences
row and duplicate workspace instance. Keep workspace-only defaultsSaved indication
as before. Center the existing action group. No dialog/model/portrait logic change.

Add useful isolated ConversationComposer stories with real controlled props,
I18n/QueryClient providers and no portrait/API context. This is the actual input
leaf, not a whole-chat story or new harness. Verify regular/workspace/active
states using existing theme/viewport controls. Optional portrait query is disabled
without an owner; inspect browser requests for accidental service calls.

Checks: scoped ESLint/Prettier/styles, web typecheck (~10–30s), pinned real-browser
stories desktop1280 and mobile390, open real settings popover, change mode via
keyboard/pointer and Escape; ensure no submit/stop/context regression in actual
controlled view (~30–60s). No CSS/DOM-order-mirroring tests for a reversible move,
no full suites/catalog build or paid/provider checks. Existing persistence/backend
proof remains valid because those handlers and services do not change. Existing
hook test tutor-conversation-composer concerns delayed conversation creation,
not this markup, so rerunning it would not test the correction.

Guides contextual-language-assistant-and-knowledge and knowledge-workspace already
identify Response settings in the composer without prescribing the previous outer
row. No guide behavior, command, outcome, failure or source mapping changes are
needed. Their existing saved-preference journeys stay semantically unchanged;
actual popover anchoring/layout is the changed boundary and is verified here.
Small approved-pattern move does not need independent designer or security review.
Root reviews final diff. Rollback is scoped markup/style/story files, no data reset.

## Evidence and outcome

Pending implementation and selected checks.

## Verification reassessment

Tentative standalone composer story compiled/typechecked after its fixture was
completed, but rendering its newly included dependency graph made the task-owned
Storybook server unresponsive (index requests timed out, server CPU~100%). One
restart reproduced it. Removed both tentative story files, rather than changing
catalog configuration or refactoring imports for this placement correction. The
exact preview compiler cause is unconfirmed; do not ship a story that stalls it.
No runtime component/API logic was changed to bypass this. Story exception:
ConversationComposer includes portrait/query state and broad Knowledge feature
imports; it is not a cheap independent view boundary under this preview pipeline.
A separate catalog/import investigation can address that seam if needed.

Replace the attempted story proof with two unchanged existing actual-app cases:
editor/real-tutor responsive case (Text source composer,17.3s previous body) and
empty-workspace recovery case (actual workspace settings popover,~34s prior body).
One guarded assistant fixture/runFlow setup, minimumTests2; no new/mirrored test,
no paid providers. Estimate60–90s. Existing captures show actual position; popover
case checks settings interaction/disabled semantics and responsive headers. The
removed stories invalidate no runtime source proof. Root restores only its own
preview process and closes its task-scoped browser.

## Final outcome and evidence

AC1–AC3 complete. One ComposerPreferences now follows the Context trigger inside
contextActions/inputFrame for all composer modes. Removed both old placements
and obsolete preferencesRow styles. The settings component itself, state,
callbacks, popover, portrait and form handlers are unchanged. Workspace-only
saved-default acknowledgement stays guarded by workspace. Action group centers
its controls; preferences remain36px desktop and44px at narrow touch width.

Source preflight: one bounded JSX relocation, deletion of the now-unused row,
center alignment and nonshrinking/touch-size control styles. No refs/events,
public contracts, imports, services, model settings or other product components
changed. No independent review is warranted for this small approved-pattern move.
No experimental story, catalog configuration or extra test code remains.

Checks: exact ConversationComposer ESLint passes; scoped Prettier and web styling
contract pass; web typecheck passes. The failed first story fixture typecheck
(missing replyLanguage/tone/explanationLevel) was fixed before its passing run;
that entire experimental story was then removed. Removing it changes none of
the passing runtime source/type evidence. No unit/full suite/catalog build for
this presentation-only correction. Final git diff check clean.

Two unchanged real-app cases in one guarded runFlow assistant fixture:
file(contextual-assistant|knowledge-workspace)\.journeys\.spec\.ts,
grep'editor and real tutor collapse the sidebar|an empty workspace recovers edits',
minimumTests2. Runa47fcb99-3d6d-4704-aeeb-da4f92cfb343 passes2/2,0skips,
34.360s total (3.350s setup,29.602s execution,1.408s cleanup). It proves source
composer placement and actual worksheet settings popup/persistence/close behavior.

Additional existing mobile case, knowledge-workspace.journeys.spec.ts,
grep'the workspace switches between mobile document and tutor tabs', minimumTests1,
rund04a28fe-17f0-40db-b049-59354de1d4c5 passes1/1,0skips,25.972s total
(2.000s setup,22.959s execution,1.013s cleanup). Root viewed final Text1200,
worksheet settings1440 and mobile390x844 captures: settings is adjacent to Context
inside the white input frame, mobile targets fit, no new footer row or overflow.
Existing cases check browser errors/unexpected requests and actual settings/
drawer/focus/draft behavior. This is current code in real Next/backend/PG/Redis,
loopback55488/56488,3336/4006, synthetic accounts/model boundary,0paid calls.
Owned resources cleaned and generated next-env.d.ts restored. Reused existing
critical utilities/lock/ownership rather than introducing another browser harness.
Guides still accurately describe composer Response settings, with no scenario,
command, outcome, persistence or source-map changes; no guide revision edit needed.

The task safe-browser session languon-composer-layout-
3b7a706030f57544b7b3b48db5cf4602 was closed. No story rendering success is claimed.
Its failed exploratory observations are superseded by actual-app evidence, not
reported as passing checks. Initial long session slug was rejected before launch;
a shorter generated slug was used. The confirmed root-owned preview process was
restarted after removing the experimental story; /index.json responds again with
190entries and no experimental Composer story. Server remains on6007 for the user.
Preview compiler investigation is not part of the product change or its claim.

Raw logs: /private/tmp/languon-composer-placement-{app,mobile,source-lint,
source-format,styles,types-final}.log. Full reports/artifacts under each run's
test-results/critical-flows/<runId> directory. Curated screenshots under
test-results/composer-preferences-review/. Root checked final tracked changes
match the tested implementation and are limited to3runtime files below.
Surface commit a152f9d2 is complete; this correction remains uncommitted.
Main stays80d330bd; no merge/push/deletion. Rollback only this3-file patch.
No additional known product risks; isolated composer-story tooling remains an
explicit, removed experiment, not a shipped regression.

### Tested source identity (SHA-256)

- `apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/conversation-composer.tsx`: `4d7ec995600393bb9d5dc2be6b778f63d53b06dcf043e901bc0cab69f8a23281`.
- `apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/composer.module.css`: `892ad2691964555e3aad661537d33dbeca22f9ae015c6f8bd9e8e90a2ad43774`.
- `apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/portrait-composer-settings.module.css`: `8ae0852f06696300c1d0608542a469df9781cca863bed470dac6b2fcc5bb8f37`.

## Acceptance and commit — 2026-11-12

User requested committing the correction. Current source includes the user's
subsequent desktop trigger refinement:32px instead of the tested36px, with its
border removed;44px mobile target is unchanged. Preserve this requested styling.
Placement markup and composer styles still match the tested hashes above. Existing
browser proof remains valid for placement/popover behavior; it does not establish
the appearance of this latest desktop-only size/border refinement. Current styling
contract, exact changed-CSS formatting and diff checks pass. No runtime logic changed.
The authorized commit includes this refinement; no main merge/push requested.

Retrospective: the optional composer story investigation cost more than the
placement change. Removed that experiment, restored the original preview and
reused maintained real-app journeys, which took34.360s and25.972s total. Future
small moves at this orchestration-heavy boundary should use those existing
journeys directly. No new mirrored tests or broad suite were needed.

Committed trigger CSS SHA-256: `06a77ce2c7146ae68fb03d11d0097cd5ff8a5f4d421fdae4bf2ffd6dda0cea48` (user refinement; static-checked).
