# Improvement: Tutor positioning beside source content

Status: Complete
Created: 2026-10-19
Updated: 2026-10-19

## Routing decision

Existing-contract UX enhancement: refine existing tutor docking/floating controls,
launcher and dictionary actions. No backend, API, data, security, dependency or
new product journey. User requested UI improvements, not a full feature lifecycle.
Use improvement-development, frontend-development, ui-ux-composition,
browser-verification, testing and user-flow-e2e. Root delivery rules apply.

## Scope and acceptance

- AC-1: Desktop dictionary and text dialog tutor defaults to a right companion
  slot beside source content, reserving space. Shared content/companion wrapper
  follows FSD boundaries and preserves scrolling/modal interaction.
- AC-2: Header More options has a Detached chat checkbox. Detaching restores
  floating dock/size controls; returning to the slot preserves chat/composer
  state. Preference is scoped to the mounted workspace, with docked default.
- AC-3: Desktop dictionary fixed actions show icons with hover/focus tooltips.
  Mobile actions remain usable when chat is folded and below the revealed sheet.
- AC-4: Dormant/folded launchers are circular AI icon controls, with AI Tutor
  tooltip and accessible open/status labels. Busy/unread/interrupted status stays.
- AC-5: Regression tests, desktop/mobile real browser evidence, lint/typecheck,
  mapped guide and independent overlay/layout review complete.

Relevant constraints: ADR0005/0016/0029/0030; app-local CSS Modules/tokens,
Tooltip/IconButton/Menu primitives, native dialog top layer. No supplied design.
Selected sources: tutor-shell CSS/header/layout hook; dictionary-editor actions;
text workspace viewportBody and Dialog body; UI kit Tooltip/IconButton stories.

## Plan

- [x] Implement slots, default docking/settings, icon launchers/actions.
- [x] Focused state/interaction tests and mapped real browser journeys.
- [x] Update guide mapping; check final diff; independent completion review.

## Verification and evidence

Scope searches use rg/direct caller tracing (no healthy semantic index).
Dictionary actions and maintained E2E/doc changes delegated with disjoint owners.
Main owns layout integration and final decisions.

- Shared CompanionLayout owns content and companion slots and mounted-workspace
  placement state; only expanded attached desktop reserves a column. Text fills
  native dialog body, dictionary keeps sticky viewport-height chat beside source.
  At widths below1024 use existing overlay/sheet placement rather than squeeze
  source into a narrow column. No chat remount on detachment/folding.
- More options checkbox restores existing left/right/size controls when detached.
  Circular Sparkles launchers retain status/accessible labels, shared Tooltip
  shows localized AI Tutor. Dictionary actions use existing Button icon mode
  and opt-in TrainingLauncher/Menu tooltip; no other callers change by default.
- Shared dictionary guests retain their existing inline login link; authenticated
  companions use the new slot. Five existing page tests pass.
- `pnpm lint`:PASS; web typecheck:PASS; web styles:check:PASS.
  Focused tutor/menu/UI kit/navigation/speech tests:45pass/9files. Worker initial
  Menu/launcher regression subset:10pass/3files (overlaps45; not summed).
- Real mapped HTTP2 passed on first run; mobile sheet passed. Initial browser
  runs exposed a test Escape error (menu intentionally closes on selection) and
  Next dev indicator occluding circular launcher. Fixed test ordering, moved
  normal dev indicator first to top-right, which then covered the docked
  minimize control. Root cause is framework corner overlays colliding with
  app corner controls; disable only the dev badge globally (errors still
  surface) rather than continue moving it or force clicks. Final rerun pending.
- System context diagram: next.config indicator-only delta leaves API/proxy/
  persistence relationships unchanged. Reviewed source, refreshed fingerprint;
  all9 diagrams current. Mermaid bodies/rendering unchanged; feature045 browser
  evidence remains valid for atlas presentation.
- Existing text workspace278lines and shared dictionary page retain established
  cohesive controller/composition; this change wraps existing content without
  moving behavior into another monolithic controller. No unrelated split.
- No auth, permission, remote calls, model tools or untrusted HTML behavior
  changes; security review not triggered. Independent layout/focus review is
  required because shared slots/Menu and native/fixed overlays affect stacking.

## Remaining risks and removal

Native dialog stacking, floating/sidebar offsets, keyboard menu Escape and mobile
fixed actions have final real-browser proof below. No database change; no DB verification
beyond disposable infrastructure needed by existing real-app journey. Revert
scoped UI changes to remove; layout preference has no persisted state.

## Author preflight — final patch

- Final registered `pnpm test:e2e:contextual-assistant`:PASS,2 real HTTP
  journeys/5.92s and3 Chromium journeys/48.6s (desktop text11.9s,
  dictionary8.5s,mobile21.1s). Run tutor-docking-20261019-verified, exit0.
  Exclusive local disposable PostgreSQL55444 and Redis56444/1, fixture backend
  and real Next app; synthetic identities and external model adapter only.
- Browser assertions cover source/panel adjacency, detached/reattached draft
  retention, old floating dock/resize controls, launcher circle+tooltip,
  dictionary Add card/Train square icons+tooltips, mobile actual hit-testing
  above actions, exact390 sheet width/no internal overflow, existing390/320
  sheet fold/stop/retry, native popover keyboard focus. No page/console errors,
  unexpected failed requests or500s. Initial mobile width regression fixed by
  preserving CSS100% width on mobile rather than desktop inline width.
- Main visually inspected final desktop source+chat and mobile dictionary sheet:
  readable source, distinct full-height right column, no clipped footer controls
  or action overlay. Durable screenshots under evidence/tutor-source-docking.
- Guide metadata/marker702893f4036ddd01 current (web+backend marker-only).
  24guides/16validator tests and selected mapping pass. Source map expanded for
  shared wrapper/Menu, text/public dictionary owners and local Next config.
- Final web typecheck, scoped ESLint, styling contract and diff-check pass.
  Root lint passed for the patch; later bounded files also scoped-linted.
  Generated next-env.d.ts restored by registered runner; no generated diff.
- No API/persisted state changed; no additional database verification required.
  No architecture relationship changed; diagram freshness reconciled above.
- Independent review passed below; base42248f6 plus captured current patch includes
  all tracked/untracked sources. Evidence manifest excludes active records/images
  to avoid self-reference. No commit or push authorized by this improvement flow.

## Independent review

### Initial review

- Mode/boundary: initial completion review of the complete tracked and untracked
  patch from base `42248f6`, captured by the 27-path manifest
  `evidence/tutor-source-docking/tested-files.sha256` (manifest SHA-256
  `cd21567eafab5a9453ae8afc2d14427428893f2a4ca35b0af323321251bccd22`).
  Reviewed the improvement acceptance criteria, applicable root/web instructions,
  ADR-0005/0016/0029/0030, full source/test/doc diff, surrounding layout, focus,
  menu, tooltip, dictionary, text-dialog and assistant callers, and the recorded
  unit/static/browser evidence. The manifest verifies against the reviewed files.
- `TSD-R1` — **Medium**, open. Location:
  `apps/web/src/fsd/pages/shared-dictionary/ui/shared-dictionary-page/shared-dictionary-page.tsx:213`;
  missing coverage in
  `apps/web/tests/e2e/contextual-assistant.journeys.spec.ts`. The patch changes the
  authenticated shared-dictionary page to place its assistant in the new companion
  slot, but the final three Chromium journeys exercise the text workspace, owned
  dictionary and narrow owned dictionary only. The mapped
  `private-shared-source-lifecycle` scenario is backend integration coverage, and
  the five shared-page component tests neither exercise a signed-in assistant nor
  establish rendered CSS adjacency. A signed-in learner can therefore open a
  shared dictionary and encounter an unverified squeezed, overlaid or misplaced
  tutor despite the other covered surfaces passing. Reproduce by opening a valid
  `/shared/dictionaries/<share-id>#<key>` as an authenticated learner at desktop
  width, opening the tutor, and comparing the shared page/tutor bounds; also check
  that the anonymous sign-in action remains inline. Add one focused real-browser
  shared-dictionary assertion for right-side adjacency and the retained guest
  inline action, or remove this additional changed surface if it is outside scope.
  Close with a passing maintained browser journey on the recaptured final patch.
  Affected risk: AC-1 and ADR-0016 runtime evidence.
- No other material functional, focus, accessibility, FSD, security, performance
  or acceptance defect was found in the reviewed boundary. The text-dialog and
  owned-dictionary slot composition, attached/detached state retention, menu focus,
  desktop action tooltips, mobile stacking/hit testing and circular localized
  launcher are coherently implemented and covered at the appropriate layers.
- Initial verdict: **changes requested** for `TSD-R1`. Residual coverage after that
  closure is the untested 768–1023px responsive fallback; the implementation
  deliberately keeps the established floating overlay below the 1024px slot
  breakpoint, and this is a bounded verification gap rather than a demonstrated
  defect.

## TSD-R1 initial remediation evidence (superseded by final integration)

Added maintained `shared-dictionary-tutor-placement` browser scenario. Creates a
real shared dictionary capability through owner API, signs up a separate reader,
and verifies enabled composer and right-side source/panel adjacency. Isolated
guest context verifies the visible/hit-tested login link belongs to main content
and companion slot is empty. No internal service/page mocks.
Focused registered runner passed real HTTP2/2 (4.77s) and Chromium1/1 (6.5s,
runner11.8s). That2HTTP+4Chromium consolidation reached the fixture signup limit; the
final integration below reuses the existing owner and passes. Guide and both
mapped markers synchronized to `sha256:281d8b2b1290a752`; scoped ESLint/mapping
pass. Production files unchanged from initial reviewed/browser-tested state;
only test/guide/marker delta closes this finding. Final27-path source/test/doc
manifest SHA256 `093ea2633507141f3f4d3b656edb60bc6c4f57f65bc22e40193203f4a155a9a5`
matches the captured file state.

### Remediation review

- Mode/boundary: bounded remediation review of the `TSD-R1` delta only: the new
  `shared-dictionary-tutor-placement` Chromium scenario, guide scenario/mapping
  update, backend/web revision markers, focused run evidence and recaptured
  27-path manifest SHA-256
  `093ea2633507141f3f4d3b656edb60bc6c4f57f65bc22e40193203f4a155a9a5`.
  Production source is byte-identical to the initial reviewed state. The current
  manifest verifies, `git diff --check` passes, and the reviewer independently
  reran the selected user-flow mapping check successfully.
- `TSD-R1` — **Resolved**. The maintained scenario provisions a real shared
  dictionary and rotated capability through the owner API, uses a separate
  authenticated reader, opens the actual shared page and tutor, verifies the
  panel is attached to the right without overlap and that its composer is enabled,
  and checks overflow/runtime failures. A separate anonymous browser context
  establishes that the login action stays visible and hit-testable inside main
  content while the companion slot remains empty. The focused registered run
  passed real HTTP 2/2 and Chromium 1/1 on the recaptured patch, satisfying AC-1
  and ADR-0016 for the affected shared/guest surface. The final full mapped rerun
  is useful consolidated evidence but is not required to re-prove unchanged
  production paths already covered by the valid initial run.
- Remediation verdict: **pass; no material findings remain**. No new trust,
  architecture or shared runtime surface was introduced by the test/doc-only
  remediation, so expanded review was not warranted. Residual risk remains the
  previously noted 768–1023px responsive fallback matrix gap; no defect was
  observed or inferred in that established overlay behavior.

### Final evidence-state confirmation

- The remediation test was integrated into the existing
  `dictionary-card-copies-preserve-visible-fields` journey so its owner and
  dictionary are reused; the separate authenticated reader and anonymous guest
  contexts, real capability rotation, adjacency/composer assertions, inline-link
  hit testing, empty-slot assertion, overflow checks and runtime-error checks are
  unchanged in substance. Fetching the current dictionary version before rotation
  correctly accounts for the cards created earlier in the journey. This structure
  stays within the real signup rate limit without bypassing or changing runtime
  configuration.
- The integrated dictionary selection passed real HTTP 2/2 and Chromium 1/1
  (12.7s browser phase). Guide coverage now describes the shared checks under the
  existing dictionary scenario; both mapped markers are synchronized to
  `sha256:746b3cafb3d922b4`. The reviewer verified the final 27-path manifest
  SHA-256 `ba88cf6d227dd43a31f931c65baa9c8ff77e9fb07dee0e73c097fb3aa1825d95`,
  reran the selected mapping check, and confirmed `git diff --check` remains clean.
  Production source remains byte-identical to the initial review.
- `TSD-R1` remains **resolved** and the final review verdict remains **pass; no
  material findings remain**. This test-only integration does not warrant a broad
  rereview or change the recorded residual responsive-matrix limitation.

## Final closure

All acceptance criteria are implemented and verified. Final registered full suite
`pnpm test:e2e:contextual-assistant`, run
`tutor-docking-shared-integrated-complete`, exit0: real HTTP2/2 (3.85s),
Chromium3/3 (43.4s: text7.9s, owned+shared dictionary11.4s, mobile19.9s).
Guest/read-only shared entry is covered in the dictionary journey. No page/
console errors or unexpected failed requests. Final root lint passes;
workspace typecheck/style checks and focused unit evidence remain valid because
production source has not changed. Guide/mapped markers746b3cafb3d922b4 current.

The standalone extra test initially exceeded the fixture's real5signup/hour
limit before mobile. Integrated shared assertions reuse the existing owner;
only the separate reader adds an account. Full final suite passes with the
rate limit enforced. No production policy was altered or assertion weakened.

Independent review: PASS; TSD-R1 resolved, no material findings remain. Final27
source/test/doc manifest SHA256
`ba88cf6d227dd43a31f931c65baa9c8ff77e9fb07dee0e73c097fb3aa1825d95`.
Disposable services are cleaned by the verification owner; ordinary development
infrastructure remains untouched. No generated output diff, commit or push.
Only residual coverage limit is the established768–1023 floating fallback not
included in the real-browser viewport matrix; desktop1440 and mobile390/320 pass.

Screenshots: [text docking](evidence/tutor-source-docking/tutor-attached-text-desktop.png),
[mobile layering](evidence/tutor-source-docking/dictionary-chat-above-actions-mobile.png),
[shared reader](evidence/tutor-source-docking/shared-dictionary-attached-tutor-desktop.png),
[guest entry](evidence/tutor-source-docking/shared-dictionary-guest-sign-in-desktop.png).
