# Evidence: Global app sidebar and WIP home page

Updated: 2026-10-12

## Acceptance coverage

| ID   | Implementation                                                              | Proof              | Result   |
| ---- | --------------------------------------------------------------------------- | ------------------ | -------- |
| AC-1 | Root universal AppShell, desktop/rail/drawer, home logo, responsive offsets | E-1–E-3            | Verified |
| AC-2 | Guest/bootstrap masking, principal-scoped navigation cache and guards       | E-1, E-3, E-4      | Verified |
| AC-3 | GuestArea/shared preferences, modal-safe Popover portal and Escape          | E-1–E-3            | Verified |
| AC-4 | Server-rendered WIP, route titles, shared page-height variable              | E-1–E-3            | Verified |
| AC-5 | ADR-0030, guide/maps, checks and review                                     | E-1–E-5, REVIEW.md | Verified |

## State identity

Base 6d56636 on feature/global-app-shell. Final runtime/config/test file identity
is captured in evidence/runtime-source.sha256 after all repairs; deleted old shell
files are accounted for by the base/diff. Security review's immutable earlier
snapshot is evidence/security-source.sha256; later sizing and route-title repairs
do not alter its authentication, principal/cache, or capability invariants.
Initial completion snapshot is evidence/initial-review-source.sha256.
No unrelated initial work or runtime dependencies.

## E-1 — Automated and static checks

- Full web suite: 57 files / 536 tests passed; renewed after shared Field/Input repair.
- Focused shell/home: 21 tests passed, including guest/bootstrap zero requests,
  route variants, two identities in one query client, logout, modal portal and focus.
- Root lint, web typecheck, styling guard, affected formatting and diff checks pass.
- All 20 guides/maps validate. New global-app-shell guide and existing locale,
  UI-kit, profile, auth and dictionary mappings synchronize stable scenarios.
- Small early test-authoring failures fixed: home import used its actual one-file
  entry; off-dictionary navigation tests open the existing disclosure before
  looking for dictionary rows. Assertions retain semantic coverage.
- Production webpack and Storybook builds pass after final runtime CSS repairs.
  Existing catalog chunk/plugin timing warnings are advisory.

## E-2 — Maintained real-browser verification

Chromium; real API/PostgreSQL/Redis and deterministic local dictionary worker,
synthetic accounts/manual dictionaries; no paid AI. Task-owned PG
languon-global-shell-pg on 55442, database languon_global_shell_test; Redis
languon-global-shell-redis on 56382/db1. Web3342/API4042; no shared infrastructure reset.

Every invocation used:
`AUTH_E2E_WEB_ORIGIN=http://localhost:3342 AUTH_E2E_BACKEND_ORIGIN=http://localhost:4042 AUTH_E2E_DATABASE_URL=postgres://fixture:fixture@localhost:55442/languon_global_shell_test AUTH_E2E_REDIS_URL=redis://localhost:56382/1 AUTH_E2E_DIST_DIR=.next-global-shell-e2e`.
Credentials above are disposable fixture values. Unique AUTH_E2E_RUN_ID namespaces
follow the established harness and preserve real application rate-limit policy.

- Initial global-shell-20261012 selected app-shell/i18n/ui-kit/profile/auth:
  7 cases passed, 3 failed. Guest rail was genuinely obstructed by the Next
  indicator; both profile cases hit the legitimate shared-address signup limit
  after the batch registered five accounts. Neither forced clicking nor rate
  limit relaxation was used.
- global-shell-guest-profile-20261012: app-shell.journeys.spec.ts and
  profile.journeys.spec.ts, --workers=1: 4/4 pass in25.7s, including gear/cookies/
  unchanged URL, desktop rail, mobile nested Escape/focus, two-user isolation,
  real profile/security/removal and WIP logo destination.
- global-shell-reader-training-20261012: selected `long RTL` in the flashcard
  journey: 1/1 pass20.7s, fullscreen/native touch/zoom/reduced motion.
  An unmatched owner title was not claimed as coverage.
- global-shell-owner-reader-20261012: selected `owner creates, edits|anonymous reader keeps`
  in dictionary-platform: valid shared-reader capability/fork case passed;
  owner exposed 200%-text narrow overflow, not an access or capability regression.
- Narrow owner retries isolated toolbar then input sizing. Diagnostic ancestor
  widths proved a 436px implicit body grid track inside320px. The complete existing
  owner lifecycle passes after zero-minimum tracks and wrapping:
  global-shell-owner-track-20261012, `--grep 'owner creates, edits' --workers=1`,
  1/1 pass25.1s. Input bounds, keyboard focus, field columns and lifecycle assertions
  are retained, with ancestor sizing included in failure diagnostics.
- Final renewed source: global-shell-final-auth-20261012 selects auth/i18n/UI-kit
  files, --workers=1: 6/6 passed in 27.3s. global-shell-final-shell-20261012 selects
  app-shell/profile/flashcard files with --grep 'guest settings|global navigation|truthful account|saves a unique|long RTL', --workers=1: 5/5 passed in 29.0s.
  All eleven renewed cases follow the final shared sizing repairs. Owner lifecycle
  final run also passes. Earlier valid shared-capability proof remains valid:
  no later capability/auth/API change; shared field shrink behavior is proven by
  owner input-bounds checks and renewed auth forms. Not an exhaustive page matrix.

## E-3 — Visual supplement

Safe-wrapper session languon-global-shell-visual-2609990f31af0b7786923f3eee032188.
Actual desktop WIP/empty guest sidebar/footer inspected in
`/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1791807730856.png`.
This preceded dev-indicator relocation; the WIP/content geometry is unchanged,
while the final rail interaction case proves unobstructed Settings after the fix.
Later attempts after ephemeral test servers exited received connection refusal;
those blank/error-page screenshots are not proof. Session closed. Real maintained
journeys prove final route, focus, mobile/zoom and console/request behavior.
No external-design fidelity claim; existing runtime UI is the composition target.

## E-4 — Review and limits

Scoped security review PASS: evidence/security-review.md; no exploitable findings.
No permission/backend/SQL/API/persistence change. No DB specialist needed; disposable
services are journey fixtures. No new test harness or unresolved system concurrency
requires a separate tester. Initial completion review found F041-R1 (route-prefix
collisions), repaired with shared segment-aware matching; remediation review PASS.

Browser evidence is representative, not exhaustive locale/theme/page combinations.
Security reviewer notes no deterministic old-response-after-switch test; guards and
cache-key isolation were independently traced and current identity tests pass.

## E-5 — Completion-review remediation

F041-R1: route title, dictionary disclosure default and rail current-link state
now share exact-or-slash-boundary matching. Three signed-in component regressions
assert generic title, closed disclosure and no rail aria-current for lookalike
not-found paths. Focused shell/home: 24/24 pass. Canonical guide adds these cases,
fixes its startup anchor, and maps revision sha256:d323acf5857e750d.
The guest browser case checks all four missing routes at mobile width; expected
404 allowance is confined to those exact paths. global-shell-review-route-20261012,
app-shell.journeys.spec.ts --workers=1: 2/2 pass19.8s on real isolated fixtures.
Root lint, web typecheck, styling guard, all20 guide/map validation and production
build pass after the repair. Catalog proof reused: no catalog/shared primitive
changes since its passing build. Prior profile/auth/owner/shared/learning browser
proof reused: only segment-boundary route classification changed, with existing
valid families preserved. Final runtime manifest includes all41 changed web files.
Full web suite renewed after remediation: 57 files / 539 tests pass.

## Cleanup

Playwright stops task app/worker processes after invocations. Task browser closed.
Task-owned disposable containers stopped; their ephemeral synthetic fixture data
was removed automatically. Existing dev containers/user processes preserved.
Generated next-env drift restored to the previously clean baseline after builds.
