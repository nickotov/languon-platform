# Evidence: Sidebar navigation

## E11 — Restored sidebar alongside learner portrait (2026-10-21)

Integration base main a574884; saved sidebar e5c4c24. Branch feature/sidebar-portrait-restoration. [Restoration source manifest](evidence/restoration-source-manifest.json) identifies162 runtime/test/infrastructure paths, including deletions. Every sidebar widget file is byte-identical to the saved sidebar except application-chrome's additive focused-interview bypass. Main portrait functionality remains present. Source manifest distinguishes bytes inherited from either reviewed feature from combined integration paths.

- Contracts build/test:15files140tests pass. Backend typecheck, scoped integration/fixture lint and build pass. Backend unit sweep132files1102tests passes; integration tests requiring explicit infrastructure were skipped in that sweep and independently executed below.
- Web full unit suite135files985tests passes, including explicit restored-sidebar-on-portrait/manual/profile/text-editor regressions. Scoped ESLint, production build and post-build typecheck after tracked Next declaration restoration pass.
- Disposable PostgreSQL55481/languon_auth_portrait_test: navigation-store, sidebar-migration, portrait-persistence and sidebar-text-source suites37tests pass. Upgrade regression explicitly starts with main0079 and applies new0080; checks memberships, nullable folders, search/privacy/pins and portrait persistence. No shared development database used for destructive testing.
- Generated0080_luxuriant_lake SQL has SHA256956c00ccba30b80ba94689d9f8f9a821adbeab302886cead5cee1023874938b4, exactly identical to the historical sidebar0076 SQL. Canonical main migrations0000–0079 and ledger checks remain unchanged. Drizzle check passes. Historical sidebar0076 is not inserted into canonical main history.
- Registered portrait runner `pnpm test:e2e:learner-portrait -- --output=/private/tmp/portrait-restored-sidebar-final` passes backend2/browser2 on disposable targets. Real navigation module is mounted in the portrait fixture; tests require Main navigation/Search/Create on portrait overview/manual, exclude it during focused interview, and reject navigation404/console/page/server errors. Nine source-grounded captures plus hashed manifest retained in [combined portrait captures](evidence/portrait-integration-restored). Root inspected the actual overview image: restored240px sidebar beside portrait content.
- Guarded Texts runner, runID sidebar-portrait-restoration-final, explicitly confirmed PostgreSQL55443/languon_auth_texts_ui_web_test and Redis56443/1, selected `owned title search|contextual sidebar renders|independent text keeps|guest appearance|global navigation`:4tests pass33.7s. Covers real account switching, search/pin/recency, geometry/flyouts/drawers and independent Texts move/share/dirty guards. Real portrait composition is also mounted in this older fixture; no HTTP stubs or weaker error assertions. Fourteen screenshots retained with hashes in [sidebar restoration captures](evidence/restoration-sidebar-final).
- Initial old disposable Texts schema was correctly rejected by checksum guard; reset only that explicitly disposable target. First combined browser attempt exposed missing portrait fixture routes and a transient detached Pin menu; proper fixture composition and serialized final run pass without weakening assertions. A production build initially overlapped Playwright artifact output and failed ENOTEMPTY; completed builds serially before final browser run. Final tracked source is verified, not the failed intermediate environment.
- Guide schema check validates27guides; exact sidebar-navigation/global-app-shell/learner-portrait/texts mappings pass. Combined shell guide preserves portrait dashboard and restored sidebar geometry; mapped revision updated after review.
- Current local development database was backed up privately on the host before additive0080. Migration succeeds; copied2saved navigation metadata rows from untouched originalDB with exact digest verification. OriginalDB, original sidebar branch and recovery stash remain intact. `pnpm dev:all` again passes migrations and starts all applications and dictionary worker.

Independent completion review and hosted-reference gap closure are being recorded in REVIEW.md and DESIGN.md; these are separate from the passing author checks above. No paid model calls, deployment or push.

Current status: Complete. E11 combined restoration and independent review pass; [actual hosted reference comparison](evidence/reference-restoration/REVIEW.md) closes historical GAP-01 for representative desktop structure. Mobile source compositor limits are explicit; real local responsive evidence passes. Full pixel equivalence is not claimed.

Historical pre-restoration checkpoint:
Base: main `5efaafe`, branch `feature/sidebar-navigation`, uncommitted working patch.
File fingerprints: [evidence/change-state.json](evidence/change-state.json).

## E01 — Navigation backend

Latest 14 HTTP/real PostgreSQL tests pass, including whole-library literal title
search, owned active resources/private knowledge drafts/independent texts,
monotonic last-opened/concurrent pins, inactive-owner isolation, tombstone purge,
and five-item existing-resource fallback without fabricated metadata. Command:
`pnpm --filter @languon/backend exec vitest run src/modules/navigation/interface/http/navigation.routes.test.ts src/modules/navigation/infrastructure/persistence/drizzle/navigation-store.test.ts`
with confirmed disposable database `languon_auth_texts_navigation050_test` on
localhost55443. Scoped ESLint, backend typecheck and formatting pass.

## E02 — Texts backend and independent database verification

Two real PostgreSQL files /31 tests passed on isolated
`languon_auth_texts_backend050_test`: nullable CRUD/jobs, moves/version conflicts,
revision preservation, direct and inherited sharing, shared create/copy consent,
proposal discard and worker format gating. Follow-up two pending-job recovery
tests passed, including stale active cancellation and reloaded proposal discard.
Six focused unit files /36 tests passed.

Independent tester verified two upgrade/concurrency tests on isolated
`languon_auth_texts_upgrade050_test`: populated pre0076 folder/text/v1-job identities
survive migration and retry; new null membership/jobs are valid; concurrent share
rotation and confirmed moves cannot publish stale inherited access. One additional
real PostgreSQL source test verifies independent owner draft/saved access,
foreign-owner denial, direct sharing, and move-out revocation of folder access
while retaining direct access. Optional-key typing correction passed backend types.

No destructive checks used shared databases. PostgreSQL17 and Redis8 containers
are task-owned. Migration0076 and snapshot/journal were generated by Drizzle CLI.

## E03 — Final automated/static/build checks

- Contracts: `pnpm --filter @languon/contracts test`,13 files/126 tests passed.
- Backend unit/navigation sweep:116 files/972 tests passed; latest E01 covers
  subsequent fallback changes. Logs `/tmp/sidebar050-backend-unit-final.log`.
- Web: `pnpm --filter @languon/web exec vitest run --maxWorkers=2`,124 files/874
  tests passed,83.16sec. Log `/tmp/sidebar050-web-tests-final-user-fixes.log`.
- `pnpm lint`, web/backend typechecks, web styling contract and affected Prettier
  checks passed. Logs `/tmp/sidebar050-lint-user-fixes.log`,
  `/tmp/sidebar050-web-type-final.log`, `/tmp/sidebar050-style-final.log`.
- Web production build and backend build including declaration generation passed.
  Logs `/tmp/sidebar050-web-build-user-fixes.log`,
  `/tmp/sidebar050-backend-build-user-fixes.log`.
- Deployment role static checks:6 tests passed, `/tmp/sidebar050-role-static.log`.
- Focused user fixes: Texts3 files/11 tests and shell/navigation/hover/nested/shared
  six files/41 tests passed before the final whole-web sweep.

Earlier broad checks caught stale shell test assumptions, a missing established
optional assistant callback argument, and disposable clients constructed outside
opt-in beforeAll. Those were corrected without weakening product assertions or
safety gates. A large Knowledge test timed out under parallel load and passed
focused and in the final bounded whole-web sweep. One stale nested-popover test
ran while its native mock changed; the corrected final sweep passes.

## E04 — Browser journeys and guide validity

All eight mapped journeys have valid passing evidence: five unchanged shell/Texts
cases in final4; three affected cases renewed in E08. Independent v3 translation
is verified through real admission→worker→proposal→reload recovery→explicit Save,
with null folder and translated alignment preserved. No paid AI was called.

The Texts fixture uses real navigation, Knowledge and learning capability
compositions plus real Redis. Only its explicit test-only shared-IP verification
budget is raised for synthetic accounts; production/account limits are unchanged.
All26 guide mappings and three affected guide checks pass. E08 has final commands,
source fingerprints, runtime error checks and screenshots.

## E05 — Source and rendered proof

Magic Patterns MCP retrieved all59 files of artifact
`d331e500-740c-4e3e-83ec-7f1f2e9acfe3`. The frozen source, prompt and SHA256 manifest
are retained in `designs/sidebar/v001/`. Source inventory UI01–09 was inspected;
source geometry, controls and states were compared with runtime evidence. Root
inspected the actual desktop/phone Texts screenshots after user-requested polish.

The user explicitly refined section shortcuts to five with existing-resource
fallback and requested better Texts headers/sections. These changes are recorded
in FEATURE/EXEC_PLAN/DESIGN; provider source remains frozen. Fallback keeps
lastOpenedAt null and never writes history. Global palette recents remain actual
opens. Rail Home/Create now use right-side shared tooltips and the logo mark is
centered; E08 proves the rendered result.

Hosted-reference limitation: MCP exposes source but no rendered preview capture.
The public OpenGraph image is generic provider branding. GUI browser capture is
blocked by missing macOS Accessibility permission. Actual hosted-reference versus
local-render comparison remains unverified; no rendered-reference fidelity claim
is made. Runtime screenshots and source checks do not silently waive that gap.

## E06 — Review and remaining work

Independent security review PASS, no material findings. See [REVIEW.md](REVIEW.md).
Independent completion review passed without product defects; see its linked report
in REVIEW.md. E09 closes editor+tutor automatic collapse/session override browser
proof through the existing deterministic contextual-assistant harness. No deployment, push,
branch deletion or shared data operation is authorized or performed.

## E08 — Reported sidebar and Texts library fixes: final browser evidence

The final user-fix browser run `sidebar050-userfix10` passed **3/3 journeys in
28.5 seconds** with the repository-pinned Playwright 1.62.1 / Desktop Chromium.
It ran the real web 3335 and API 4005 fixture with real PostgreSQL/Redis and
deterministic local providers. No paid provider calls, API interception or forced
clicks were used.

Exact reviewed command and disposable configuration:

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true AUTH_TEST_DATABASE_URL=postgres://languon_e2e:languon_e2e@127.0.0.1:55443/languon_auth_texts_ui_web_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_texts_ui_web_test ALLOW_DISPOSABLE_REDIS_TESTS=true AUTH_TEST_REDIS_URL=redis://127.0.0.1:56443/1 AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56443/1 AUTH_E2E_RUN_ID=sidebar050-userfix10 pnpm test:e2e:texts-web sidebar-navigation.journeys.spec.ts texts.journeys.spec.ts --grep 'owned title search|contextual sidebar renders|independent text keeps'
```

The task-owned containers are `languon-sidebar050-postgres` and
`languon-sidebar050-redis`; the fixture retains its random Redis namespace.
The runner stopped its owned web/API processes. Containers were left for root
verification and cleanup.

- `owned-title-search-and-synced-navigation` passed in 6.4 seconds: seven existing
  unopened dictionaries survive reload; exactly five section shortcuts render;
  their returned `lastOpenedAt` values remain null and genuine global recents
  remain empty. The oldest dictionary remains searchable outside those five.
  Independent text and private Knowledge draft title search, actual-open
  recency, pin/unpin synchronization across separate authenticated sessions,
  and completed second-owner isolation queries also pass.
- `responsive-sidebar-and-keyboard-flyouts` passed in 5.4 seconds: the 32 px brand
  mark is centered within the 64 px rail to within 1 px; hovering Home and Create
  displays visible tooltips. Existing 240/64/320 px geometry, nested pin-menu
  focus/Escape behavior, unified Create, dark appearance, tablet/mobile drawers,
  local overflow and 44 px mobile controls remain verified.
- `web-independent-text-membership` passed in 10.6 seconds: the Texts library's
  New text/New folder header actions have equal heights of at least 44 px at
  1440×1000 and 390×844. Both native section disclosures are keyboard-focusable
  and collapse with Space / expand with Enter. Folder and independent-text
  sections remain legible without horizontal overflow. Existing independent
  creation/moves, shared-folder confirmation, canonical bookmarks, sidebar /
  palette / native-history unsaved guards, and independent v3 translation
  proposal reload recovery followed by explicit Save also remain verified.

All three cases assert no page exceptions, unexpected console errors, failed
requests or unexpected HTTP responses of 400 or above. An unauthenticated
`/auth/refresh` 401 is the sole expected HTTP exception. No such unexpected
runtime failures occurred.

Nine sanitized rendered screenshots are retained under
[evidence/browser-userfix10](evidence/browser-userfix10): expanded and dark
sidebar, rail flyout, tablet/mobile drawers, Create menu, whole-library palette,
and Texts library at desktop/phone sizes. The library images were inspected:
header actions align, section bars show icons and chevrons with consistent
spacing, and no controls clip. The Independent texts bar shows a visible focus
ring because the preceding keyboard disclosure check focused it. These are
actual application screenshots; they do not close the separate missing rendered
reference proof gap.

Tested working-patch fingerprints (base `main 5efaafe`; no runtime edits during
the final run):

| File                                                     | SHA-256                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web/tests/e2e/sidebar-navigation.journeys.spec.ts` | `da72e796355349fee7225999d93bf8f0e922b2cfd0624af616c2578175e00b85` |
| `apps/web/tests/e2e/texts.journeys.spec.ts`              | `9060f1ef4a7bbaa51c8b4830caf43b558856226edc022268013536024aef95ac` |
| `apps/backend/tests/support/texts-web-server.ts`         | `a8018cb4364dcc252125172692286e8ad9ae2441d8e05c4b8433a11b51aaa5a9` |

Guide revisions are `sidebar-navigation sha256:030165acd42957c3` and
`texts sha256:911a4b49af2922ff`. All affected guide checks, all 26 guide mappings
(`pnpm docs:user-flows:check`), focused Prettier and diff-whitespace checks pass.
The prior userfix9 run also passed 3/3 before strengthening the final HTTP-error
assertions. Earlier unchanged journeys retain their separately recorded evidence;
this entry claims the three selected cases, not a new full eight-case execution.

## E09 — Real editor and tutor adaptive sidebar

The remaining AC04 browser case passed through the existing guarded contextual
assistant runner: backend4/4 tests (5.20sec), one selected browser case (4.3sec;
10.6sec browser stage). Command `AUTH_E2E_RUN_ID=sidebar050-tutor12 pnpm test:e2e:contextual-assistant contextual-assistant.journeys.spec.ts --grep 'editor and real tutor collapse'` with explicitly confirmed disposable PostgreSQL55444
`languon_auth_assistant_web_test` and Redis56444/1. These were separate task-owned
containers, never shared databases.

The actual independent editor at1200px starts with240px sidebar. Opening the real
Tutor creates a real conversation and shows its composer, automatically collapses
the sidebar to64px. Explicit expansion restores240px and persists at1180px while
Tutor stays visible. Strict console/page-error/request/unexpectedHTTP assertions
pass. No turns were submitted: zero POST /turns and real conversation turns=[].
No paid model call. Two sanitized runtime screenshots retained under
[evidence/browser-tutor12](evidence/browser-tutor12).

The contextual fixture adds the same production navigation composition already
used by the Texts fixture; no production/runtime behavior changed. Fixture lint,
backend/web types, contextual guide mapping and formatting passed. No guide
behavior or revision changed. Existing runner restored tracked Next types and
stopped its3336/4006 processes. The first test attempt expected201 rather than the
endpoint's documented200 response; only that test expectation was corrected.

Test SHA256 `e2343deda1913067e4413dbf1df6eaaf7f3f4ab79f21a02ae4b7d51f989e2f1d`;
fixture SHA256 `af148117432ff3548a208765a19d0d77c08e591b004ef5f14960d6698c5ca097`.

Final hygiene: next-env.d.ts restored exactly from tracked HEAD after the guarded
runners. Post-restoration web typecheck passed. Four task-owned disposable
containers stopped; shared development containers untouched. Final source
fingerprints are in evidence/final-change-state.json; initial review manifest is
preserved separately. The hosted-reference comparison remains the sole open proof
item; the feature is not marked Complete or locally squash-merged.

## E10 — Texts library presentation correction after888d15d

Correction status: Complete. Runtime and test scope is one existing library page;
no data, API, permission, dependency or new journey changes. Original hosted-design
proof gap remains separate from this user-requested page redesign.

Both header actions explicitly use default44px sizing and a page-local44px
minimum; both labels stay visible. Sections use simple headings/icons/chevrons
and a divider with20px content spacing. Empty folders now use one centered flex
layout:44px icon,16px icon-to-copy gap,4px title-to-help gap, no nested shared
EmptyState padding or default paragraph margins. Native disclosure behavior and
all existing actions are preserved.

Targeted checks:3 unit files/11 tests pass (`pnpm --filter @languon/web exec vitest run tests/texts-library-controls.test.tsx tests/texts-library-query.test.tsx tests/texts-organization.test.tsx`); page-scoped ESLint, web typecheck, styling contract,
Prettier and diff checks pass. No full suite or production rebuild needed for this
bounded page-local composition/CSS correction. No independent security/completion
review warranted by this delta; separate browser worker verified rendering and
root inspected all four captures.

Real browser command: `AUTH_E2E_RUN_ID=sidebar050-textslibrary14 pnpm test:e2e:texts-web texts.journeys.spec.ts --grep 'independent text keeps'`, using confirmed disposable
PostgreSQL55443/languon_auth_texts_ui_web_test and Redis56443/1. Exactly one existing
journey passed11.8sec (18.7sec browser stage). Both actions exactly44px, equal
top/bottom alignment within0.25px, visible unclipped labels; Active/Archived views
at1440x1000 and390x844; keyboard collapse/expand; icon/title/help spacing bounds;
no horizontal overflow. Strict console/page-error/request/unexpectedHTTP checks
clean. Existing creation/move/shared-consent/dirty guards/translation recovery
also remain covered by the reused journey.

Four sanitized screenshots: [browser-textslibrary14](evidence/browser-textslibrary14).
Root and browser worker inspected all four: no clipping, aligned labeled actions,
clean section headings, compact archived copy. First browser attempt caught a test
selector using button rather than the existing tab role; corrected selector
preserves assertions. Test formatting after the passing run changes whitespace
only (tested hash c94b6d3c1771cadbbbd2157665b0254442ef62c4357328cf1dbbc757124e2ec6).
No runtime edits after that pass. Texts guide behavior/commands/source mapping are
unchanged; existing guide mapping check passes, no revision change required.

Base commit888d15d plus working-patch fingerprints:

- `apps/web/src/fsd/pages/texts/ui/library-page/library-page.tsx`: `6d068c142069959f47cf5c9907be32a85c99a22178222a7ba31d2184ba5cbc6b`.
- `apps/web/src/fsd/pages/texts/ui/library-page/library-page.module.css`: `fe03d161161bc49ce641ab47b78350bfecd2ff005d0de068fd733b4bd5ae9edb`.
- `apps/web/tests/e2e/texts.journeys.spec.ts`: `c37465da9860d4ec5c170585444bcf7c3b418d8216281eea188c7f82ca4e64b9`.

Owned API/web processes stopped; task-owned disposable containers stopped. Generated
next-env restored exactly to tracked baseline. This correction introduces no
remaining known page-level risk and authorizes no automatic commit or merge.
