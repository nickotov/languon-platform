# ExecPlan: Global app sidebar and WIP home page

Feature: [FEATURE.md](FEATURE.md)
Updated: 2026-10-12

## Goal and specification

Deliver AC-1–AC-5 on feature/global-app-shell from 6d56636 without backend or
permission-policy changes. Specification owns acceptance text.

## Existing architecture

Provider tree owns ApplicationChrome; route/session gate chooses AuthenticatedAppShell
vs SiteHeader. Shell owns sidebar/drawer; navigation hook is ungated/unscoped.
AccountArea combines preferences/account actions. PopoverContent portals to body,
outside native modal drawer top layer. ADR-0005/0016/0029 bind FSD/runtime/CSS.
Supersede only ADR-0007 control placement, preserving locale semantics.

## Test and review strategy

Focused component/query/session/popover regressions, full affected web suite, root
lint, typecheck, styling guard, production/catalog builds, guide mapping checks and
real Playwright journeys with existing disposable synthetic PG/Redis fixtures.
No new harness: no separate tester needed; reviewer assesses valid tests.
No SQL/API change: database/contract/backend checks not applicable.
Scoped security review for private navigation/session isolation; no policy redesign.
Use durable browser journeys for runtime proof; supplement only uncovered visual/focus
cases. Independent completion review after author preflight.

## User-flow documentation

Create global-app-shell/app-shell.journeys.spec.ts, registered web-playwright.
Update magic-profile-page/profile.journeys.spec.ts, web-ui-kit/ui-kit.journeys.spec.ts,
web-i18n-support/i18n.journeys.spec.ts, user-authentication/auth.journeys.spec.ts.
Execute affected mapped journeys against local disposable fixtures.

## Milestones

- [x] M1 — Global shell, guest preferences and home (AC-1–AC-4); focused tests.
- [x] M2 — ADR/docs/maps and author preflight/browser evidence (AC-5).
- [x] M3 — Independent review/remediation, final records and local squash integration.

## Progress and ownership

2026-10-12: plan approved, clean base/branch and artifacts established.
Root owns shell/query gating/home/offsets/localization/ADR/integration.
Guest-preferences worker owns footer/shared preference extraction/Popover seam.
Test-docs worker owns tests and guide maps. Preserve each other's changes.
Implementation complete; focused 21 tests and full 536 tests/typecheck pass.
Root lint, styling guard and production/catalog builds pass. New/actualized
mapped browser cases passed in batches; final evidence renewed after shared
narrow-field layout repair. Scoped security review PASS. Completion review next.

## Decisions and discoveries

D-1: global chrome replaces route whitelist, remains through session transitions.
D-2: footer /login retains existing default return; no new capability URL handling.
D-3: optional Popover portal container keeps body default; drawer popup mounts in modal.
D-4: narrow ADR successor changes only locale-control placement.

D-5: actual browser rail check exposed Next development indicator covering guest
Settings. Move its documented position to bottom-right; never force-click controls.
D-6: existing owner 320px/200%-text check exposed toolbar/tabs wrapping and authoring
implicit-grid-track overflow. Preserve controls/values, allow wrapping, and use
zero-minimum grid tracks. Ancestor geometry diagnosed the body track at 436px inside
a 320px box; failing input-bounds assertion retained with useful sizing diagnostics.
Shared Field/Input shrink boundaries support the same narrow-content contract.
These are bounded page-fit compatibility repairs, not an editor redesign.
D-7: independent review found lookalike route-prefix collisions. Shared
segment-aware matching preserves valid route families while keeping unrelated
not-found titles/disclosure/rail state generic; component/browser regressions pass.

## Validation and remaining work

[EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md) own results/verdict.
Independent completion and remediation review PASS; F041-R1 fixed. All acceptance
criteria verified, fixtures cleaned up and generated drift restored. Final full
web suite539 tests, static checks, production build and canonical browser renewal
pass. Delivery is committed on the feature branch and squash-integrated locally
into main under the authorized feature Git policy; branch retained, no push.
No external blocker or open material finding. See REVIEW.md for coverage limits.
