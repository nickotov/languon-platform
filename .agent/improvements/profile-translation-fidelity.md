# Improvement: Profile translation and field-label fidelity

Status: Complete
Created: 2026-09-15
Updated: 2026-09-15

## Routing decision

- Intended outcome: Remove the Profile Security render crash and restore visible Account field and removal-dialog copy against the supplied Magic Patterns design.
- Why improvement: The regression spans a shared translation boundary and related Profile composition, broader than a one-surface correction but adds no new capability.
- Feature boundaries checked: no new business endpoint or contract, persistence, auth policy, deletion semantics, runtime dependency, deployment or product journey. A browser favicon compatibility URL reuses the existing generated icon.
- Escalation rule: stop before any new behavior or data model is required.

## Context and scope

- Current behavior: Security crashes at `translator.ts:11` during interpolation of the passkey revoke description; the user reports blank Account input labels and removal-dialog input/checkbox text.
- Expected behavior: Profile renders for every supported locale even with an incomplete runtime catalog; labels and destructive-confirmation copy are visible, associated with controls, and follow the design's order.
- In scope: translation fallback/error guard, Profile Account labels and deletion-dialog composition only if rendered verification shows gaps, conventional favicon URL compatibility, focused tests and existing guide updates if observable behavior changes.
- Out of scope: profile field persistence, availability checks, email/OAuth actions, deletion policy or backend work.
- Likely files/surfaces: `apps/web/src/fsd/shared/i18n`, Profile Account and account-controls UI, relevant tests.
- Relevant constraints: FSD, shared Input/Select/Checkbox/Dialog contracts, runtime `--sys-*` tokens, Magic Patterns artifact `c5093f52-facb-4015-9276-9f03bd3331a2`.
- Related guides: `magic-profile-page`, `profile-account-controls` (existing behavior should remain unchanged; inspect mappings and update only if expected results change).
- Rollback: Revert this focused patch; no schema or dependency removal.

## Plan

- [x] Reproduce or isolate missing-catalog crash and label loss with a focused test.
- [x] Implement a bounded translation and presentation correction.
- [x] Run focused tests, affected lint/typecheck/build and real-browser Account/Security/dialog verification.
- [x] Check guide traceability and final diff; record evidence and review.

## Verification

| Check | Result |
| --- | --- |
| Tests | Focused i18n/Profile tests 15 passed; affected web suite 24 files/156 tests passed. |
| Lint/typecheck/build | Root lint, web typecheck, isolated `.next-e2e` production build and `git diff --check` passed. Build output contains the favicon route; generated `next-env.d.ts` change restored. |
| Runtime/browser | Managed Chrome 152 session `languon-profile-copy-3d0dea79e995296a79ffdf5bad475302` checked synthetic signup, Account and Security at 320px and desktop, warning/input/checkbox/footer at 320px. No page errors or unexpected failed requests. `GET /favicon.ico` follows to existing `/icon` with 200 `image/png`. Session closed. |
| Documentation/user-flow | Existing guides already describe visible Account labels and Security/passkey controls; no expected journey or command changed. Guide checks and mappings for `magic-profile-page` and `profile-account-controls` passed. |

## Outcome and evidence

- Changes made: Translation lookup falls back to the bundled English catalog when a serialized locale catalog lacks a key. This prevents missing keys from rendering blank labels or throwing at interpolated passkey safety copy. Added browser favicon compatibility route redirecting to the existing generated icon. No Account or checkbox CSS change was needed: label text lives in the shared Input/Select/Checkbox components and was already passed by Account/deletion components.
- Regression evidence: An incomplete-catalog i18n test failed before the fix with `Full name` resolving to `undefined`; a Profile component test covers all four Account grid labels, Username, DELETE input and acknowledgement checkbox, then opening Security without a render crash under the same incomplete catalog. Both pass after the fix.
- Commands and results: `pnpm --filter @languon/web exec vitest run tests/i18n.test.ts tests/profile-page.test.tsx` (15 passed), `pnpm --filter @languon/web test` (156 passed), `pnpm --filter @languon/web typecheck` (pass), `pnpm lint` (pass), `AUTH_E2E_DIST_DIR=.next-e2e pnpm --filter @languon/web build` (pass), `pnpm docs:user-flows:check` (pass), two user-flow mapping checks (pass), managed browser diagnostic (9 checks and headless launch pass), favicon curl (200 PNG after redirect), `git diff --check` (pass).
- Browser evidence: narrow Account labels screenshot `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1789467611189.png`; narrow deletion dialog screenshot `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1789467497103.png`. Security accessibility snapshot displayed email/password/provider/passkey/session groups at the local documented origin. The only 401 was expected signed-out `/auth/refresh` before synthetic signup; console contained only normal dev/HMR messages.
- Documentation: No guide content or revision marker changed; the prior expected behavior is restored. E2E was deliberately not rerun because the missing-catalog case is deterministic at the translation/component layer and the live browser verified the affected journey without a new system contract.
- Review: Checked Magic Patterns ProfileDetailsSection, UsernameField, DeleteAccountDialog and shared form components against rendered 320px UI; all required labels and confirmation copy are visible and semantically associated. The prototype's fake username availability, credits, 14-day self-cancellation and deletion semantics were not ported. No auth/security/data contract changed. Existing unrelated source and `design/main.pen` edits preserved; no commit.

## Remaining risks

- The exact stale/incomplete catalog delivery condition in the user's prior browser session is not established; all source catalogs contain the key. The fallback makes that condition non-fatal, and fresh live verification showed no crash or blank labels.
- One synthetic `example.test` development account created for browser verification remains in the local dev database; no user or shared data was deleted. Missing translated keys show English copy until the active catalog is refreshed.
