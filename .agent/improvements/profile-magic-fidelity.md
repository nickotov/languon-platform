# Improvement: Profile Magic Patterns fidelity and password-change reliability

Status: Complete
Created: 2026-09-15
Updated: 2026-09-15

## Routing decision

- Intended outcome: Match the supplied Magic Patterns Profile account, deletion, and security composition while fixing the existing current-password change failure.
- Why improvement: Several existing settings surfaces need cohesive visual restructuring; this is broader than one bounded correction.
- Explicit-feature check: the user did not request a feature lifecycle in this turn.
- Feature boundaries checked: no new persisted fields, OAuth connection, email-link delivery, public contract, auth policy, migration, production dependency, or deployment change. The interface-language control reuses the existing locale cookie behavior.
- Escalation rule: stop and request explicit feature authorization if fixing password change or matching the design requires crossing one of those boundaries.

## Context and scope

- Current behavior: Account details omit the designed grid and locale selector; username save is detached; deletion dialog doubles padding and lacks design hierarchy; Security misses provider rows and uses generic passkey/password cards; current-password change reportedly returns `internal_error`.
- Expected behavior: Supplied prototype's card rhythm, account form, username row, destructive confirmation, email/password/provider/passkey ordering and responsive behavior, while truthful unsupported capabilities remain Coming soon. Password change works with the existing transaction and session semantics.
- In scope: Profile page, account-controls visual components, auth SecuritySettings composition, localized copy, regression tests, existing flow-guide updates when observable behavior changes.
- Out of scope: Persistence for full name/learning language/time zone/photo; actual email-link change, OAuth linking, new account-deletion semantics. Preserve 30-day live purge and admin-only recovery; preserve typed DELETE guard.
- Likely surfaces: `apps/web/src/fsd/pages/profile`, `apps/web/src/fsd/features/account-controls`, `apps/web/src/fsd/features/auth`, authentication backend transaction if established bug confirmed.
- Relevant constraints: ADR-0001, ADR-0007, ADR-0016, ADR-0017; runtime tokens/shared UI; Magic artifact `c5093f52-facb-4015-9276-9f03bd3331a2`.
- Related guides: `magic-profile-page`, `profile-account-controls`, `user-authentication` (passkey journey).
- Rollback: Revert focused uncommitted patch; no schema or dependency removal needed.

## Screen and regression plan

- Primary job: update supported account/security settings and understand future options without false affordances.
- Composition: Account Profile details card has photo placeholder, two-column field grid and separately aligned username row; Data and Danger cards follow at 24px sibling rhythm. Security follows Email, Password, Sign-in methods, Passkeys, and existing Sessions cards. Dialog stays focused and scrollable at narrow widths.
- Required: frontend E2E for account/locale/dialog/passkey/OAuth states; backend HTTP integration for password change with real disposable PostgreSQL/Redis if available; affected tests, lint, typecheck, build; real browser at 320px and desktop including dialog/keyboard/dark mode.
- Deliberately omitted: paid/external services, real OAuth/email links, unsupported profile persistence.
- Password hypotheses: (1) SQL session-replacement transaction constraint/ordering, supported by a 500 after correct credential verification; (2) response/session handoff, supported by a 200 API but browser error; (3) route/request validation, supported by a 4xx before service; (4) current credential state or hashing failure, supported by a failure before transaction.

## Plan

- [x] Reproduce password failure using fake disposable account and isolate root cause.
- [x] Implement focused visual and existing-behavior changes.
- [x] Add/update reliable regression coverage and mapped guides.
- [x] Run targeted and affected validation, browser/database when available.
- [x] Inspect final diff and record review/evidence.

## Verification

| Check | Result |
| --- | --- |
| Tests | Web 24 files/154 tests and backend 72 files/501 tests passed; guarded Argon2 + authentication HTTP integration 2 files/9 tests passed; mapped auth/profile Playwright 5 journeys passed. |
| Lint/typecheck/build | Root lint, web typecheck, web and backend production builds, and `git diff --check` passed. |
| Runtime/browser/database | Managed browser checked Account, Security, deletion dialog, locale, dark mode, keyboard dismissal, 320px/desktop. No app console errors or unexpected failed requests. Guarded HTTP integration used dedicated loopback PostgreSQL/Redis; task containers and synthetic data removed. |
| Documentation/user-flow | `pnpm docs:user-flows:check` and `pnpm user-flow:e2e -- check` for all three mapped guides passed; revision markers updated and mapped journeys executed. |

## Outcome and evidence

- Changes made: Adapted the Magic Patterns account grid, 24px card rhythm, username row, actual interface-language selector, designed delete dialog and Security email/password/provider/passkey ordering. Unsupported full name, learning language, time zone, photo upload, email-link delivery, and OAuth connections are explicitly Coming soon without invented data or requests. Preserved live 30-day deletion/admin-only recovery, typed DELETE, passkey and session functionality.
- Password root cause: the native Argon2 binding consumes an AbortSignal, so password change reusing the HTTP request signal for old-password verification and new hashing threw a native argument error and surfaced `internal_error`. Each Argon2 operation now receives a fresh relayed abort signal; cancellation still propagates. The replacement session's revocation timestamp is captured after preparation so session ordering remains valid. Disposable HTTP regression verified 200, prior session 401, replacement session 200.
- Commands and results: `pnpm --filter @languon/web test` (154 passed), `pnpm --filter @languon/web typecheck` (pass), `pnpm --filter @languon/web build` (pass), `pnpm --filter @languon/backend test` (501 passed), `pnpm --filter @languon/backend build` (pass), `pnpm lint` (pass), guarded backend integration (9 passed), mapped Playwright auth/profile files (5 passed), `pnpm docs:user-flows:check` (pass), three guide mapping checks (pass), `git diff --check` (pass).
- Browser evidence: managed local browser screenshots for desktop Account and narrow Account/Security/delete dialog; exercised language change English → Spanish → English, dark/light, dialog guard and Escape. The narrow dialog keeps warning, DELETE input, checkbox, and footer visible together. Managed session closed.
- Documentation: `magic-profile-page`, `profile-account-controls`, and `user-authentication` guides updated; mapped E2E revisions synchronized. No new user journey or ADR was needed.
- Review: Final independent-style self-review of design, auth cancellation, session ordering, data honesty, and populated passkey state. Three findings resolved before handoff: inline passkey removal did not match designed confirmation; unknown capabilities incorrectly appeared unavailable; failed rename closed the editor. Added confirmation/cancel/revoke and failed-rename tests. No critical/high or material security findings. Source and tests do not log secrets or call paid model services. Unrelated `design/main.pen` user edit preserved; no commit made.
- Disposal: Removed only `languon-profile-check-postgres` and `languon-profile-check-redis` after verification; their synthetic temporary data is not recoverable. No shared containers were touched.

## Remaining risks

- Full unrelated Playwright suite was unintentionally selected once through an extra CLI `--` and failed on journeys outside this improvement. The corrected mapped-file invocation passed all five affected journeys; the unrelated broad-suite failures were not pursued here.
- Populated passkey row behavior is covered by unit and virtual-authenticator Playwright tests; the managed exploratory browser covered the empty state, not a populated passkey visual snapshot.
