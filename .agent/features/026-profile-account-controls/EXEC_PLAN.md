# ExecPlan: Profile Account Controls

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-15

## Goal

Make Profile the functional home for identity/security settings and deliver safe, recoverable-then-purged account removal.

## Specification

- In scope: See FEATURE.md AC-1 through AC-8.
- Out of scope: actual email change/delivery, emailed-link password change, public profiles/attribution, billing/credits, selective backup erasure.

## Existing architecture

- /profile composes Magic-style tabs but identity/delete/security actions are mocks; /security owns real SecuritySettings password/passkey/session controls.
- users owns identity/status; authentication owns sessions/credentials; dictionaries own content/transient document cleanup; administration owns guarded, audited mutations.
- users currently has pending/active/disabled. Admin and upload FKs restrict hard deletion, owned dictionaries cascade, and independent forks use source SET NULL.
- ADR-0001/0002/0005/0009/0010/0012/0016/0017 constrain the seams. Unrelated design/main.pen is dirty user work; branch feature/profile-account-controls comes from local main.

## Acceptance criteria

- [x] AC-1 — Unique public-ready handle in account UI.
- [x] AC-2 — Security controls in Profile with linkable tab and legacy redirect.
- [x] AC-3 — Honest email mock; current-password flow retained.
- [x] AC-4 — Recent-auth, owner-guarded deletion schedule and immediate revocation.
- [x] AC-5 — Audited admin-only cancellation; no generic restore/self-recovery.
- [x] AC-6 — Verified idempotent live purge, surviving forks, audit tombstone.
- [x] AC-7 — External deletion-event restore gate.
- [x] AC-8 — Contracts, guides, E2E, browser, DB, review/security evidence complete.

## Test strategy

- Unit: Required for handle normalization and lifecycle transitions.
- Integration/contract: Required for SQL uniqueness races, auth/status revocation, HTTP codes, owner/cancellation guards, purge retries, forks/storage.
- E2E: Required for critical profile/auth/admin journeys; exhaustive matrices stay lower-layer.
- Browser: Required for account/security UI at 320px and desktop, dialog/keyboard/error states, and admin cancellation.
- Migration: Required against explicitly disposable PostgreSQL, including null-handle compatibility.
- Deployment/restore: Required for worker privileges/readiness and fail-closed replay.
- Guide: Create profile-account-controls; update magic-profile-page, user-authentication, admin-user-management.
- User-flow E2E: Registered web-playwright = pnpm --filter @languon/web test:e2e; admin-user-management = pnpm test:e2e:admin-user-management. Inspect/check existing mappings and execute only reviewed disposable configurations.
- Review/security: Required due to credentials, deletion, personal data, and admin authority.

## Milestones

- [x] M1 — Ground specification, related guides/ADRs/FKs, branch and artifacts. Evidence: read-only inspection and synchronized user-flow inspections for three related guides.
- [x] M2 — Identity contract/model/API with uniqueness/auth tests (AC-1).
- [x] M3 — Profile/security UI and route migration with web/browser tests (AC-2, AC-3).
- [x] M4 — Deletion schedule, admin cancellation, worker and restore gate with DB/deployment tests (AC-4–AC-7).
- [x] M5 — Guides/E2E, all affected checks, browser/DB evidence, independent/security review, remediation, final diff/squash merge (AC-8).

## Progress

- 2026-09-15 — Branch, spec, and guide mappings established. Next: implement M2 while isolated Security-tab migration runs in parallel. No user work changed.
- 2026-09-15 — Identity/Profile/deletion/admin/purge/journal/deployment work implemented. Independent and security reviews exposed phantom-intent, cancelled-account, live-replay, hidden-object-version, and share-link races; ADR-0019 superseded ADR-0018 and the defects were fixed. Final focused SQL matrix 29/29, Profile Playwright 2/2, admin Playwright 6/6, pinned browser 9/9. Next: final diff and feature squash merge. Unrelated `design/main.pen` remains untouched.

## Decisions

- D-1 — Handle: canonical lowercase, DB-unique, nullable for existing users; shown only in signed-in UI. Save conflict is authoritative; no availability endpoint.
- D-2 — Email/password: email request remains a transparent client-only mock; existing authenticated password/passkey operations stay real.
- D-3 — Removal: distinct scheduled/purged states, 30-day eligibility, immediate owner/share denial, admin cancellation only before purge claim, surviving forks, ID-only tombstone.
- D-4 — Recovery: ADR-0019 supersedes ADR-0018. A pre-commit intent requires a matching post-commit marker; unmatched intent fails stop. Replay runs only on a quiesced restored database (or initial no-active-slot startup), lists retained versions, and does not reset live claims. Historical backup retention unchanged.

## Discoveries

- Existing uploads have versioned transient cleanup; purge cannot remove metadata before physical cleanup succeeds.
- Existing admin restore joins primary email and must not accidentally restore scheduled accounts; purged tombstones must not appear in ordinary lookup.

## Validation

| Check              | Status         | Evidence |
| ------------------ | -------------- | -------- |
| Unit                | Passed | Final backend 499 (ordinary DB-gated tests separate), web 153, admin 10 |
| Integration/contract | Passed | Contracts 53; disposable SQL 29 incl. migrations 0019/0020 |
| E2E                 | Passed | Profile 2/2 after remediation; auth 3/3 and admin 6/6 earlier |
| Browser/device      | Passed | Pinned browser 9/9 mobile, desktop, dark, dialog, network/console |
| Typecheck/lint/build | Passed | Affected backend/web/admin checks; web typecheck rerun after build |
| Database migration  | Passed | Disposable PostgreSQL forward migrations and SQL invariants |
| Deployment/restore  | Passed | Release 97/97 active; fake S3 gate/replay tests 6/6; real bucket drill operator-owned |
| User-flow guide/E2E | Passed | 10 guides and exact markers checked |
| Independent review  | Passed | Five critical/high/medium defects fixed; remediation re-review clear |
| Security review     | Passed | Three false-deletion paths fixed; role grants narrowed |

## Remaining work

- No required implementation work remains. Preserve unrelated `design/main.pen`. Production S3 Object Lock/versioning and IAM restore drill remain operator provision/verification, not a local test substitute.
