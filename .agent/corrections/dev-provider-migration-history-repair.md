# Correction: Local `dev:all` provider startup repair

Status: Complete
Created: 2026-09-24
Updated: 2026-09-24

## Routing decision

- Intended outcome: restore `pnpm dev:all` startup against the existing local
  development database and provider configuration without deleting user data.
- Why this is a correction: this repairs one local database that applied an
  uncommitted draft of migration `0025` while feature 028 was being developed.
  It does not change product behavior, contracts, persisted production schema,
  dependencies, deployment, or security policy.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true. The checked-in migration remains immutable; only the known local
  development history divergence is reconciled.
- Escalation rule: stop before mutation if the recorded hash, target database,
  or observed schema differs from the known draft state. Any generalized history
  repair mechanism would require reclassification.

## Context and scope

- Current behavior: `dev:all` first stops before app startup because local migration
  timestamp `1790179510900` records hash
  `c51d70dd273b558d5e58bdf5d7a678a82e341b4882e13474f9f5a4261e3ea732`,
  while checked-in `0025_loving_lilith.sql` hashes to
  `e2d7133ff2004fcdd5d0a0fa69b975d28536b297161659412c19650615ecdacd`.
- After migration repair, startup also revealed that the ignored `.env.local`
  enabled Mastra and all six card-authoring lifecycle lists but lacked the model,
  safe credential flags, activation gate, and five required budget settings.
- Expected behavior: preserve the local database, install the worker-routing
  trigger added to the final migration, reconcile this one known history row,
  apply migrations `0026`–`0028`, complete the documented local DeepSeek/Kie
  environment configuration, and allow `dev:all` to start.
- In scope: read-only target/history/schema checks; one guarded local transaction;
  normal migration and startup verification.
- Out of scope: resetting volumes, changing checked-in migrations, accepting an
  arbitrary hash, repairing shared/staging/production databases, or changing the
  migration-history guard.
- Likely files/surfaces: local `languon-postgres-1` state, ignored `.env.local`,
  and this correction record only.
- Relevant ADRs or constraints: ADR-0002 migration integrity and root prohibition
  on destructive shared-data verification.
- Related user-flow guides: `web-dev-panel`; no observable command or expected
  behavior changes, so its guide does not require revision.

## Acceptance criteria

- AC-1 — The guarded repair runs only when the local database records the exact
  known draft hash and the expected provider tables/column exist while the final
  routing function/trigger are absent.
- AC-2 — Existing local data remains intact, checked-in migration `0025` is not
  modified, and normal migration applies `0026`–`0028` successfully.
- AC-3 — `pnpm dev:all` passes migrations and starts its application processes.

## Plan

- [x] Execute the guarded local transaction.
- [x] Run the normal migration command and inspect final history/schema.
- [x] Complete the documented ignored local provider settings.
- [x] Start `dev:all`, observe readiness beyond migrations, then stop only the
      command processes while leaving normal local infrastructure intact.
- [x] Inspect the repository diff and complete this record.

## Verification

| Check                    | Result         |
| ------------------------ | -------------- |
| Tests                    | Not required   |
| Lint/typecheck/build     | Not required   |
| Runtime/browser/database | Passed         |
| Documentation/user-flow  | Not applicable |

## Outcome and evidence

- Changes made: a guarded local-only transaction verified the exact draft hash,
  provider tables/column, enum value, nine constraints, absence of later history,
  and absence of the final trigger. It then installed the checked-in routing
  function/trigger and replaced only that known history hash. The ignored local
  environment now selects `deepseek/deepseek-chat`, advertises the configured
  DeepSeek/Kie worker credentials to the API, activates managed routing, and sets
  all five documented aggregate budget values. Secret values were neither read
  into output nor changed.
- Commands and results: `pnpm db:migrate` passed and applied migrations
  `0026`–`0028`. A read-only database check matched all four checked-in hashes and
  confirmed the routing function, trigger, and worker-observation table.
  `pnpm dev:all` then passed infrastructure, dependency build, and migration
  stages; backend listened on 4000, Vite and Next.js reported ready, and the
  dictionary worker reported ready with concurrency 2 and an empty queue. The
  verification process was intentionally stopped with Ctrl-C; PostgreSQL and
  Redis remain running.
- Documentation: No command or user-flow contract change is planned.
- Review: author inspection confirmed no checked-in migration or runtime source
  changed. Independent review was not warranted because every guarded assumption
  matched and the only tracked change is this correction record.

## Remaining risks

- None known. This was a one-time repair for an uncommitted local draft; the
  normal migration-history guard remains unchanged and fail-closed.
