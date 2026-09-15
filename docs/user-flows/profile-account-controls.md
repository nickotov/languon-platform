---
feature: profile-account-controls
title: Profile Account Controls
status: current
last_verified: 2026-09-15
surfaces:
    - browser
    - api
    - system
source_paths:
    - .agent/features/profile-account-controls/**
    - apps/web/src/fsd/features/account-controls/**
    - apps/web/src/fsd/pages/profile/**
    - apps/web/src/fsd/widgets/site-header/**
    - apps/backend/src/modules/users/**
    - apps/backend/src/modules/administration/**
    - apps/backend/src/infrastructure/worker/account-purge-command.ts
    - apps/backend/drizzle/**
    - packages/contracts/src/auth/**
    - packages/contracts/src/admin/**
    - infra/deploy/compose/recovery-gate.compose.yaml
    - infra/deploy/compose/apps.compose.yaml
    - apps/web/tests/e2e/profile.journeys.spec.ts
e2e_command: web-playwright
e2e_tests:
    - apps/web/tests/e2e/profile.journeys.spec.ts
e2e_scenarios:
    - profile-handle-security-and-removal
related_features:
    - user-authentication
    - magic-profile-page
    - admin-user-management
---

# Profile Account Controls

## What this verifies

This guide covers the signed-in Profile handle form, real Security controls,
honest email-change mock, and irreversible-from-the-user removal request. It
also describes the admin cancellation, live purge, and historical-restore gate
that make the deletion journey safe. Use synthetic identities and disposable
infrastructure only. Billing, exports, public handles, and actual email-change
delivery are out of scope.

## Start the development environment

Follow the reviewed disposable startup in `apps/web/tests/e2e/README.md` for
automated browser verification. For manual exploration, use `pnpm dev:infra`,
apply the reviewed migrations to a local disposable database, then start
`pnpm dev:backend` and `pnpm dev:web`. The web app is on `localhost:3333` and
the backend on `localhost:4000`. Development/test uses an in-memory recovery
journal; it is never a staging or production restore guarantee.

## Browser verification

1. Sign up and verify a unique `example.test` identity, returning to `/profile`.
   The account summary shows the real email and an unset handle.
2. Enter a handle of 3–30 ASCII letters, digits, or underscores. Save it and
   expect canonical lowercase `@handle` in the summary and shared header. A
   second account cannot save the same canonical handle; a 409 leaves the draft
   visible with a conflict message. No availability claim is made before save.
3. Open `/profile?tab=security`. Expect current-password change, passkey
   enrollment/revocation, and session logout to remain real. Choose **Request
   email change** and expect an explicit notice that no email was sent and the
   current address is unchanged. `/security` redirects to this tab.
4. In Account choose **Delete account**. The alert dialog explains immediate
   loss of account and shared-dictionary access, 30-day live purge, and
   administrator-only cancellation. Submission stays disabled until `DELETE`
   is typed exactly. Escape/cancel keeps the account.
5. Submit with a recently authenticated account that has no active admin
   membership. Expect a dated receipt and signed-out Profile view, not a silent
   redirect. A recent-auth failure asks for sign-in; an owner guard asks for
   membership transfer/revocation. A network failure warns that the request may
   have committed and must be checked before another decision.
6. Repeat at 320 CSS pixels and desktop, using keyboard Tab/Enter/Escape and
   both themes. The header, forms, tabs, dialog, and status messages must remain
   usable without horizontal clipping.

## API verification

- `PATCH /users/me/handle` accepts an active bearer session and `{ "handle":
  "Learner_1" }`, returning `{ "handle": "learner_1" }`. Duplicate canonical
  handles and concurrent state changes return bounded 409 responses. Existing
  users can have a null handle.
- `POST /users/me/deletion` accepts `{}` with an active, recently authenticated
  bearer session and allowed Origin, returning 202 with `scheduledAt` and
  `purgeAt`. It clears the refresh cookie and revokes all account sessions and
  unlisted share locators atomically. Active admin membership returns
  `owner_transfer_required` (409); unavailable recovery journal returns 503
  without committing deletion.
- `POST /admin/users/{userId}/deletion/cancel` is a separate owner-only,
  recent-auth, reasoned, expected-version operation. It works only before the
  purge worker claims a pending request, writes an audit entry, and creates no
  session. Ordinary Restore cannot cancel a scheduled deletion.

## System verification

The account purge worker is required in staging and production, not just
development. Its dedicated database and storage credentials are distinct from
API, dictionary worker, migrator, backup, and journal roles. At or after the
30-day deadline it claims a request with fencing, waits for generation and
upload cleanup to become terminal, removes all document object versions, then
deletes live personal rows in FK order. Independent forks remain with no source
dictionary reference; audit links retain only an opaque ID tombstone. Failures
retry instead of dropping metadata while physical files remain.

The deletion recovery journal must be a separate immutable/versioned retained
bucket. Initialize its sentinel before first activation. After any PostgreSQL
restore, stop application and worker traffic, apply compatible migrations, run
the read-only-credential recovery gate, and only then start traffic. A missing
or corrupt journal fails closed. The gate re-blocks accounts whose removal
occurred after the restored snapshot and revokes restored sessions/shares; an
administrator cancellation marker is honored only at its committed user
version. Encrypted historical backup retention itself is unchanged.

## E2E coverage

- `profile-handle-security-and-removal` creates a synthetic verified account,
  saves a canonical handle, confirms the Security controls/email mock, and
  schedules deletion with typed confirmation and dated signed-out receipt.
- The related `admin-user-management` guide maps the owner cancellation
  journey. SQL transaction, purge, and recovery replay matrices stay in
  deterministic integration tests against explicitly disposable PostgreSQL.

## Expected failure and edge cases

- Validation does not submit malformed handles or confirmation text.
- Session expiry never silently schedules removal; signing in again is needed.
- A live owner cannot self-delete while their administrator membership remains
  active. Transfer and revoke first, preserving the last-owner invariant.
- A claimed purge cannot be cancelled. A journal outage rolls back scheduling
  or cancellation; a restore-gate outage prevents traffic activation.
- Email-change is a client-only mock and sends no link; current-password change
  remains the real authenticated operation.

## Automated regression checks

Run focused component, contract, backend, deployment, and traceability checks
from the repository root. Database integration tests reset **only** the
explicitly confirmed dedicated loopback `_test` database on a non-default
port; never set their safety flags for ordinary local, staging, or production
databases.

```sh
pnpm --filter @languon/web exec vitest run tests/profile-page.test.tsx
pnpm --filter @languon/contracts test
pnpm --filter @languon/backend typecheck
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check profile-account-controls
```

The reviewed `web-playwright` command described in
`apps/web/tests/e2e/README.md` executes the mapped synthetic browser journey.

## Troubleshooting

- A handle 409 means a canonical collision or stale account state; keep the
  draft and refresh before choosing again.
- A deletion 403 means recent authentication expired. A
  `owner_transfer_required` 409 means active administrator membership remains.
- A deletion 503 or recovery-gate failure requires checking the independent
  journal bucket, credential boundaries, sentinel, object immutability, and
  encryption key without logging secrets or event contents.
- If purge retries, inspect terminal job/upload cleanup and physical object
  versions on disposable data; do not force metadata deletion.

## Cleanup

Stop only processes/containers started for this guide. Test identities and
database resets belong solely to dedicated disposable infrastructure. Do not
delete shared data, journal events, retained backups, or production accounts.
