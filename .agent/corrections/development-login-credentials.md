# Correction: Restore development login credentials after database cutover

Status: Complete
Created: 2026-10-24
Updated: 2026-10-24

## Routing decision

- Restore established login behavior through a bounded local development-data
  repair. No authentication code, public contract, policy, schema or credential
  format changes are needed. User explicitly requested diagnosis and repair.
- This is not a new authentication capability or feature. Stop before any
  production/shared-data action, credential reset or access-policy change.

## Context and scope

- Feature 052 switched `.env.local` to the fresh
  `languon_ai_accounting_dev_20261023` database. It contains zero users,
  password credentials and passkeys. Both login failures follow directly from
  missing account/credential lookups.
- Preserved `languon_portrait_repair_20261021` has 12 accounts (10 active,
  2 deletion-pending), 12 password credentials and one active passkey.
- Restore active account identities, existing email verification records,
  password hashes, passkey records and their existing admin membership only.
  Preserve IDs and credential bytes. Do not restore sessions, deletion-pending
  identities, historical AI jobs, credits or old financial records.
- Source remains read-only. Target must still be empty before one atomic
  transaction inserts the selected records; abort on conflicts or missing
  dependencies. Credential material stays in memory and is never logged.
- Constraints: ADR-0001 authentication and ADR-0045 accounting cutover. The
  running capabilities endpoint reports password and passkeys available.
- Existing user-authentication guide describes the established login journey;
  its product behavior and source mapping remain unchanged.

## Acceptance criteria

- AC-1: active development identities and original credentials are available in
  the current database with exact source values and original membership roles.
- AC-2: no credential reset, authentication bypass, session copy, old-ledger
  import, source mutation or schema/application-code change occurs.

## Plan

- [x] Identify active database and compare aggregate credential counts.
- [x] Atomically restore only existing active account authentication records.
- [x] Verify exact record equality and running authentication configuration.
- [x] Record limits and final Git scope.

## Verification

- Initial evidence: empty target, preserved source counts above; same localhost
  WebAuthn RP ID and allowed origin, with password/passkey capabilities enabled.
- `node /private/tmp/restore-languon-development-identities.mjs` completed
  successfully. One target transaction restored 10 active users, 10 email rows,
  10 original password records, one passkey and one existing admin membership.
  Every inserted record was compared with the read-only source snapshot before
  commit; exact equality passed for all five tables.
- Independent security review found no material issue in the restoration
  script: development/host/database pins, empty-table checks under locks,
  read-only consistent source selection, membership dependency validation,
  atomic rollback and credential-safe output were verified before execution.
- `pnpm --filter @languon/backend exec tsx
/private/tmp/verify-languon-restored-auth-store.mts` used the real
  `DrizzleAuthStore` and current schema/client against the current development
  database. All 10 canonical-email lookups returned their original accounts
  with password credentials, active status and verified email; the passkey
  lookup returned its original active, verified owner.
- Live backend `/auth/capabilities` reports password and passkey authentication
  available. PostgreSQL connection metadata confirms the running backend is
  connected to the current accounting database, not the preserved source.
- No application implementation, environment setting, schema, security rule or
  financial record was changed. This correction record is the only repository
  change. No application compilation or new automated regression test is
  necessary for this one-off development-data repair; real database equality
  and actual store lookups establish the bounded outcome.
- Actual password or hardware-authenticator interaction requires the learner's
  private input and is left to their retry. No secrets were requested or logged.

## Remaining risks

- Device-assisted passkey signing must be retried by the user. Do not request
  their password, private keys or raw authenticator assertions.
