# Profile Account Controls

Status: Complete
Owner: Engineering agent
Created: 2026-09-15

## Problem

The Profile page has mock account actions and sends users to a separate Security page even though password, passkey, and session controls already work. A unique account handle and account removal do not exist.

## Desired behavior

Authenticated users can set/change a unique handle and manage password, passkeys, and sessions directly in Profile. Email-change requests clearly remain a mock. Confirmed account removal ends access immediately, allows only an administrator to cancel within 30 days, then verifiably purges live personal data and owned content while preserving independent forks and minimal audit references.

## Acceptance criteria

- [x] AC-1 — An optional lowercase ASCII handle, 3–30 letters/digits/underscores, is atomically unique regardless of input case; signed-in profile/header display it without public attribution or URLs.
- [x] AC-2 — Profile Security contains the existing real password-change, passkey add/rename/revoke, and current/all-session sign-out flows with recent-auth, loading, error, and retry behavior. The security tab is linkable; /security redirects there.
- [x] AC-3 — Email change visibly says Coming soon and sends no request or email. Existing current-password change remains real.
- [x] AC-4 — Account removal requires recent authentication and explicit confirmation, refuses an active admin owner until membership is transferred/revoked, and schedules a 30-day purge while revoking sessions and owner/share access immediately.
- [x] AC-5 — A distinct audited admin-only action can cancel removal before purge starts; generic disabled-user restore cannot, and there is no self-recovery.
- [x] AC-6 — A durable retryable purge removes live email/handle/credentials/owned dictionaries and product files, preserves other users' forks with source attribution removed, and leaves an opaque audit tombstone. Purge is not marked complete before cleanup verification.
- [x] AC-7 — Historical encrypted backups follow existing retention, but production restore replays deletion events stored outside PostgreSQL and blocks affected accounts before traffic resumes.
- [x] AC-8 — Contracts, migration, OpenAPI, guides/E2E, browser behavior, checks, independent review, and security review are current.

## Scope

### In scope

- Profile and administration controls, users/authentication/dictionary lifecycle coordination, a least-privilege purge process, migration, and restore reconciliation.
- English, Russian, and French account-control copy.

### Out of scope

- Sending email-change links or changing email; emailed-link password change; public profile URLs or shared-dictionary handle attribution.
- Billing, credits, photo, export, connected providers, or user self-restoration.
- Selective erasure of encrypted historical backup snapshots.

## Constraints and risks

- ADR-0001/0002/0005/0009/0010/0012/0016/0017 remain active constraints.
- Admin audit and document-upload foreign keys prevent naive hard deletion. Retain an ID-only tombstone, redact incidental personal data, and verify storage cleanup before row removal.
- The unrelated dirty design/main.pen belongs to the user and must not be edited, staged, or reset.
- Tests use fake identities and disposable PostgreSQL/Redis; no real email or paid services.

## User-flow documentation

- Create docs/user-flows/profile-account-controls.md for browser/API/admin/system journeys.
- Update user-authentication, magic-profile-page, and admin-user-management guides with their mapped E2E tests/revisions.
- Critical new scenarios: handle-create-and-conflict, profile-security-and-email-mock, account-deletion-revocation, admin-deletion-cancellation, purge-and-restore-gate. Lower-layer tests cover exhaustive races and failure matrices.

## Open decisions

- None about product behavior. The user selected account-UI-only public-ready handle, mocked email request, 30-day live purge, admin-only cancellation, active-owner transfer guard, surviving forks, and existing encrypted-backup retention.
