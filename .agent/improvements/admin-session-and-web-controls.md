# Improvement: Admin session recovery and compact web controls

Status: Complete
Created: 2026-11-11

## Routing and scope

Existing-contract improvement across admin refresh UX and two local web controls;
no new auth policy, token/cookie contract, persistence, framework, dependency or
journey. Preserve ADR0001/0010 memory-only tokens, admin-only refresh namespace,
rotating HttpOnly cookies, authorization and recent-sign-in decisions. Escalate
before policy changes. Work on main without automatic commit. Initial user edit
in dictionary-editor-common.module.css (desktop toolbar glass/spacing) is owned
by the user and must be preserved. Baseline33c99880.

## Acceptance

- AC1: Valid refresh sessions transparently renew admin access on reload/API use;
  concurrent request cancellation must not destroy a shared refresh or log out
  unrelated requests. Genuine revoked/denied/recent-sign-in cases remain enforced.
- AC2: Collapsed desktop sidebar Expand appears directly below the logo and
  remains keyboard/tooltip accessible; drawer behavior unchanged.
- AC3: Dictionary add-card/training triggers use compact desktop geometry with
  usable narrow/touch targets, preserving the user's toolbar appearance edits.

## Direction and discovery

Extend existing sidebar logo/rail and Button compact variants/tokens. Small
placement/spacing correction, no new design artifact or broad redesign. Root owns
admin; shell_toolbar_fixes owns web sidebar/editor UI plus focused shell tests.
Relevant guides: admin-user-management, global-navigation-shell and dictionary
editing (worker discovers exact mapping). Existing correction records browser-
access-token-refresh and admin-expired-token-preflight are authoritative history.
Admin already preflights expiry and retries typed auth failures; avoid duplicating
that behavior. Initial hypotheses: shared refresh inherits a cancelled caller's
AbortSignal; cross-tab outcomes are not applied to admin token state; actual
failure is recent-authentication or missing/invalid refresh cookie. Requesting a
redacted error/status from user while checking real seams. No semantic LSP tool
is exposed; scoped rg and direct caller/body reads suffice.

## Verification plan before implementation

- Admin tests/admin-api.test.ts: reproduce the smallest observed refresh failure,
  then add exact regression and run this file (~3–10s). No broad unit suite.
- Existing admin-user-management real browser login/reload journey plus exact
  short-TTL refresh case if relevant, using disposable PostgreSQL/Redis and fake
  users (~1–4min setup + execution). Do not change product TTL/recent auth or use
  real credentials. A required live environment failure remains reported.
- Web tests/app-shell.test.tsx for Expand behavior (~5s); no CSS-mirroring test.
- Affected TS/TSX ESLint, admin/web typechecks, styles contract (~10–60s).
- Browser desktop1440 and mobile390 actual sidebar/editor controls. Reuse actual
  stories or mapped real-app journey; no whole-app story or new harness.
- Guides/mappings only for changed behavior. No DB/schema change; real auth
  integration still uses disposable DB. No full suites/builds by default.
- Independent security review for refresh cancellation/concurrency changes;
  exact source preflight followed by affected evidence, no broad review restart.

## Progress and evidence

Pending discovery and implementation. Rollback: revert only scoped client/UI
changes; preserve initial user CSS patch, no data/environment rollback needed.

### Diagnosis and implementation

Confirmed defect: refreshSession forwarded its first caller's AbortSignal to the
single-flight cookie-rotating refresh. Aborting that caller rejected the shared
coordinator action, which published a null outcome. Other awaiting requests then
received authentication_required rather than a renewed session. Real admin pages
(accounting, sentence inspection and speech data) cancel these requests on
unmount; StrictMode/route changes can exercise this. A focused transport test
reproduced the survivor rejection before the fix (red-exact log). The shared
refresh now owns its transport lifetime; caller abort checks before/after await
preserve individual cancellation. Existing token preflight and one-retry logic,
Zod validation, memory storage, cookie separation and recent-auth policy unchanged.
The exact user incident's status/code was requested but is not yet supplied;
this is a demonstrated relevant defect, not proof of every possible stale-session
failure. Existing passing preflight/reload evidence rejects a universally missing
refresh path. No cross-tab/shared-package or backend policy changes are needed.

Current component proof: admin18/18, shell28/28. Scoped source security review
found no material findings; final browser/static evidence still pending. The
real shortened-TTL registered admin gate is running. Web final runtime selection
is the existing responsive-sidebar-and-keyboard-flyouts case in
sidebar-navigation.journeys.spec.ts, using the exported runFlow utility and the
same guarded texts fixture infrastructure (55487/56487,3335/4005). It adds direct
rail ordering and actual dictionary toolbar geometry proof; no new journey or
mocked browser is introduced. Run after the admin critical owner releases its
workspace lock and preserve next-env.d.ts via existing helper. Estimate1–2min.

Sidebar and AddCard are orchestration/trivial Button glue, respectively; no useful
new isolated presentation boundary is introduced, so no new stories are needed.
Worker retained user toolbar glass appearance exactly using geometry tokens,
including radius15. Desktop controls36px; narrow controls at least44px.
Guide changes document cancellation independence and below-logo expansion;
shared auth/edge behavior itself is unchanged. Edge file changes only its guide
revision marker; existing real-edge evidence remains valid, no edge rerun needed.

## Final evidence and disposition

All three acceptance criteria are implemented. Changes remain uncommitted on
main, with initial user CSS appearance preserved. No API/auth policy, backend,
credential, environment, data schema or production dependency changed.

- Admin: `pnpm --filter @languon/admin exec vitest run tests/admin-api.test.ts
  --maxWorkers=1`:18/18 pass in1.28s. Exact pre-fix shared-cancellation regression
  failed because survivor received401; retained red-exact log is not relabeled.
- Web: `pnpm --filter @languon/web exec vitest run tests/app-shell.test.tsx
  --maxWorkers=1`:28/28 pass in4.48s (worker log). No CSS-mirroring tests added.
- Both admin/web typechecks pass. Scoped9-file ESLint selection had only3blank-
  line violations in the new admin test, all repaired; exact admin-test remediation
  passes plus current web E2E lint passes.14-file formatting selection passes;
  subsequent row geometry assertion was formatted/linted separately. Final styles
  contract and git diff check pass. No full suites/builds repeated: public exports,
  runtime dependencies and packaging did not change; actual app execution and
  workspace types cover the changed seams.
- Registered `pnpm test:e2e:critical -- --flow admin-session-refresh`:
  3/3 pass,0skips,99.135s total (including1.466s cached dependency build).
  Real Chromium/Vite/Next/backend/PostgreSQL/Redis on guarded disposable
  55485/56485 and3435/4435/3436 prove reload recovery, actual60s access expiry
  before exactly one successful tariff write, and separate recent-auth denial.
  No auth/network/clock mocks or paid provider calls; assertions found no
  unexpected browser errors. Final independent security/evidence approval:
  admin_refresh_review, no material findings or further gates requested.
- Web selected existing mapped responsive-sidebar-and-keyboard-flyouts through
  `runFlow` using app=texts,file=sidebar-navigation.journeys.spec.ts,
  grep='contextual sidebar renders its source geometry and accessible rail and
  drawers',minimumTests=1. Existing withPreservedFile protects next-env.d.ts;
  critical workspace lock and reviewed disposable ownership/cleanup retained.
  Final runfd3125ee-927b-4ea0-a47f-72796eb17466:1/1 pass,0skips,
  20.900s total; real guarded texts backend/Next/PG/Redis. Final source froze
  before the run. The earlier run05358add passed geometry but screenshot review
  revealed two-row mobile wrapping; it is historical, not final layout proof.
- Root viewed desktop dictionary toolbar, collapsed1440rail and390mobile toolbar
  captures. Expand is below logo and above Search;36×36 desktop buttons have
  aligned glass background. Mobile buttons remain at least44px and now share a
  row when content fits. Screenshot review caught and fixed fixed-container
  shrink-to-fit width using width:max-content with the existing viewport cap;
  long localized controls can still wrap when necessary. Added actual English
  mobile row alignment assertion. No desktop/narrow page overflow or browser
  exceptions/unexpected requests in selected journey. Additional manual browser
  startup is unnecessary because these actual rendered journeys and screenshots
  cover the changed controls. Existing runners cleaned task-owned containers,
  volumes/processes and restored next-env.d.ts; developer app/Storybook untouched.
- Guides:34guides/16validator cases pass; admin-user-management revision
  9dafd7d45d4d16b1 and sidebar-navigation267f9cb518298d99 mappings pass.
  Dictionary-platform and flashcard-training journey semantics/commands stay
  unchanged (floating Add card and Train). Geometry is covered by the focused
  responsive scenario; no broad dictionary/generation/training reruns needed.
  Marker-only private-edge change acknowledges guide review, not changed edge
  behavior; valid existing edge proof is retained.

Source identity below covers all tracked changed files, including the initial
user toolbar edits; this record alone is untracked bookkeeping. Reports and
screenshots are retained locally in ignored test-results/private temp paths.

Final tracked binary diff SHA-256: `c0276cb6839e81ad549106cb5a3889180c2ed1c20772f0aef8c9fb3b391883a5`.

- `test-results/critical-flows/5f7c2354-4072-4c91-af7a-4a3c7900ee8b/summary.json` SHA-256 `cec210b62a3ed5332d420c498704d11ed753eb910956a3292697d7e733c0a79f`.

- `test-results/critical-flows/fd3125ee-927b-4ea0-a47f-72796eb17466/summary.json` SHA-256 `1e8e26422a4b9933d559c3daefac3cac35b85c1ed6e60cfc769b590f2ad82aa3`.

Raw reports: `/private/tmp/languon-admin-session-{red-exact,green,critical,types}.log`,
`/private/tmp/languon-shell-controls-{tests,lint,e2e-lint}.log`,
`/private/tmp/languon-admin-session-lint-remediation.log`,
`/private/tmp/languon-web-controls-{types-final,styles-final,browser-final}.log`,
`/private/tmp/languon-session-controls-{format-all,guides}.log`.
Final screenshot directory:
`test-results/critical-flows/fd3125ee-927b-4ea0-a47f-72796eb17466/sidebar-controls-artifacts/sidebar-navigation.journey-2e239-accessible-rail-and-drawers/`.
Relevant captures: dictionary-compact-toolbar-1440.png,
dictionary-touch-toolbar-390.png and sidebar-rail-flyout-1440.png.

Residual limit: user did not supply the original failing response status/code.
The demonstrated cancellation race is fixed and real access expiry recovery is
proven. Different real causes such as missing/invalid/revoked refresh cookies or
recent-sign-in requirements still require their existing recovery. We did not
extend token lifetimes, weaken authorization or assume refreshing grants recent
authentication. Rollback is the scoped diff, preserving initial user CSS styling.
