# Security review: private navigation and session isolation

Reviewed: 2026-10-12
Reviewer: Security review subagent
Verdict: PASS — no exploitable defect found in the bounded security surface

This is an early, bounded security review for Feature 041. It is not the
independent completion review and does not assess visual fidelity or completion
of AC-1–AC-5 outside the trust boundary below.

## Reviewed state and boundary

- Mode: initial, bounded threat-focused review.
- Feature base: `6d56636c07d2a1f972c9413ef9310ba4b17247e1`.
- Reviewed implementation state: the current uncommitted
  `feature/global-app-shell` state captured by
  `evidence/security-source.sha256`. `sha256sum -c` passed for every entry at
  review time. The security-relevant TypeScript/TSX and test hashes therefore
  match the captured state even if later narrow CSS-only work is outside that
  manifest.
- Primary changed files reviewed:
    - `apps/web/src/fsd/features/dictionary-library/hooks/use-dictionary-navigation.ts`
    - `apps/web/src/fsd/widgets/app-shell/hooks/use-app-shell-state.ts`
    - `apps/web/src/fsd/widgets/app-shell/hooks/use-guest-preferences-portal.ts`
    - `apps/web/src/fsd/widgets/app-shell/ui/app-shell/app-shell.tsx`
    - `apps/web/src/fsd/widgets/app-shell/ui/application-chrome/application-chrome.tsx`
    - `apps/web/src/fsd/widgets/app-shell/ui/sidebar/sidebar.tsx`
    - `apps/web/src/fsd/widgets/app-shell/ui/sidebar/dictionaries-navigation.tsx`
    - `apps/web/src/fsd/widgets/app-shell/ui/account-area/account-area.tsx`
    - `apps/web/src/fsd/widgets/app-shell/ui/guest-area/guest-area.tsx`
    - `apps/web/src/fsd/widgets/app-shell/ui/preferences-controls/preferences-controls.tsx`
    - `apps/web/src/fsd/widgets/app-shell/ui/mobile-drawer/mobile-drawer.tsx`
    - `apps/web/tests/app-shell.test.tsx`
    - `apps/web/tests/e2e/app-shell.journeys.spec.ts`
- Supporting unchanged trust-boundary files inspected:
    - `apps/web/src/fsd/features/auth/model/auth-provider.tsx`
    - `apps/web/src/fsd/features/auth/model/refresh-coordinator.ts`
    - `apps/web/src/fsd/entities/session/model/session-store.ts`
    - `apps/web/src/fsd/entities/dictionary/api/dictionary-api.ts`
    - `packages/browser-auth/src/http.ts`
    - the GET/POST `/dictionaries` route, service, composition, and Drizzle store
      paths under `apps/backend/src/modules/dictionaries/`
- The supporting auth/session/backend paths above have no diff from the feature
  base. No auth-policy, API/schema, persistence, or backend change was reviewed
  or authorized by this feature.

Threats traced: guest and bootstrap request gating, account identity rendering,
principal-scoped query caching, direct A-to-B identity changes, logout, refresh
retry, late query and create-mutation completion, owner authorization, capability
URL handling, preference-only guest controls, and accidental token/personal-data
logging.

## Findings

None. No Critical, High, Medium, or Low exploitable defect was found in the
reviewed boundary.

## Control verification

- Guest and bootstrap isolation: `useDictionaryNavigation` derives its enabled
  principal only when the session status is `authenticated` and a user ID is
  present (lines 32–35). Both private dictionaries and the language request used
  by this navigation are disabled otherwise (lines 45–53). `AppShell` uses the
  same status-plus-user invariant for private navigation/account/create rendering
  (lines 31–33, 105–110, 137–148). During bootstrap, `Sidebar` renders pending
  guest chrome and no private `DictionariesNavigation` or `AccountArea` (lines
  97–121).
- Principal-scoped cache: private navigation uses
  `['dictionaries-navigation', 'active', userId]` (line 53), reads only the
  current observer's data (lines 172–174), and cancels the departing principal's
  exact query prefix during identity cleanup (lines 78–87). A late response may
  remain only under the old principal's inactive cache key; it is not selected
  or rendered for a guest or another user.
- Refresh/direct-identity race: the query callback rechecks the captured user ID
  through `useSessionStore.getState()` immediately before each protected request
  attempt (lines 55–68, 199–205). This also rejects an automatic retry if refresh
  or another tab changes the identity between attempts. The create mutation
  checks its captured owner before its first request and again inside the
  `requestWithSession` callback (lines 89–113). A late successful mutation skips
  cache invalidation, dialog changes, and navigation unless the same principal is
  still current (lines 114–123). Identity changes also close/reset create state
  (lines 78–87 and 146–150), and the dialog is keyed by current user ID in
  `AppShell` (line 147).
- Server-side enforcement remains authoritative: the browser sends the in-memory
  bearer token through `ownerRequest`; the unchanged backend parses bearer auth,
  verifies the access token, requires the referenced session/user to remain
  active, derives `ownerId` from that principal, and filters list queries by
  `dictionaries.owner_id = ownerId`. Create persists that derived owner ID. Thus
  client gating is not the authorization boundary.
- Capability and URL handling: the new guest footer link is the literal internal
  `/login` path (`guest-area.tsx`, line 70); it does not copy the current query or
  fragment. App-shell home/profile/dictionary links are internal paths, and the
  changed shell contains no capability-key, token, `returnTo`, external URL, or
  logging construction. Existing shared-reader capability fragments therefore
  are not promoted into the new header/footer URL query.
- Guest Settings is preference-only: `GuestArea` composes only
  `PreferencesControls`, whose effects are the existing locale control and the
  allowlisted `system`/`light`/`dark` theme values. It exposes no profile,
  dictionary, create, sign-out, auth-token, or account-identity action. The only
  storage added by the shell itself is non-sensitive rail/dictionary expansion
  booleans in `sessionStorage`; theme/locale remain non-auth preference cookies.
- Rendering and logs: dictionary names and identity fields are rendered through
  React text/attributes rather than raw HTML. No `dangerouslySetInnerHTML`, raw
  secret/personal-data logging, upload, webhook, external fetch target, payment,
  cryptography, prompt, or model-tool surface was added in the reviewed boundary.

## Verification assessed

- Independent focused run at reviewed state:
  `pnpm --filter @languon/web exec vitest run tests/app-shell.test.tsx` — PASS,
  1 file / 17 tests.
- The focused suite proves no private queries for signed-out or bootstrapping
  sessions, no private controls/identity for guests, immediate replacement on a
  direct identity change, and removal on logout.
- Root supplied same-security-state results for the broader 57-file / 536-test
  suite, typecheck, lint, builds, and a real two-identity E2E journey. This early
  review did not rerun those broad commands. Browser/visual verification remains
  root-owned and is not part of this verdict.

## Residual risks and unverified assumptions

- Verification gap, not an exploitable finding: the component test changes
  identity only after the first query resolves, and the E2E journey performs
  sequential logout/login. Neither test deterministically holds an old
  dictionary query or create mutation open while switching principal, then
  resolves it late. The reviewed guards and identity-keyed query prove the
  intended behavior by code inspection, but a delayed-promise regression test
  for both paths would provide stronger defense-in-depth against future removal
  of those guards.
- The review did not independently execute the real two-identity E2E or inspect
  its disposable backend/database state. It relies on the root-supplied pass for
  runtime integration evidence and on direct source inspection for the server
  owner checks.
- Existing authentication, refresh coordination, backend authorization, shared
  capability handling, and QueryClient lifetime were inspected only as callers
  and invariants needed by this feature. Their broader security posture is not
  re-certified here.
