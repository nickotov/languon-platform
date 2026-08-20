# Correction: Admin membership pnpm separator

Status: Complete
Created: 2026-08-20
Updated: 2026-08-20

## Routing decision

- Intended outcome: make the documented `pnpm admin:membership -- ...` and
  `pnpm admin:membership:stdin < ...` commands reach the existing administration
  operator, and document first-admin prerequisites and local/remote examples.
- Why this is a correction: this repairs a deterministic argument-forwarding
  defect in an existing CLI journey and expands its existing operator guide; it
  adds no capability, contract, persistence, permission, dependency, or
  deployment model.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: switch to feature development before continuing whenever any
  root correction condition becomes false.

## Context and scope

- Current behavior: pnpm forwards its conventional `--` separator through the
  nested workspace script, so the command parser sees `--` as the command and
  prints usage. The stdin wrapper is affected by the same extra token.
- Expected behavior: one leading pnpm separator is ignored; all existing strict
  flags, confirmations, validation, and zero-owner bootstrap rules remain
  unchanged.
- In scope: CLI argument normalization, focused parser regression tests, first
  administrator documentation, user-flow revision synchronization.
- Out of scope: creating users, changing owner authorization, database changes,
  changing remote deployment, or executing a membership mutation against the
  user's local database.
- Likely files/surfaces: backend administration command/parser tests,
  `docs/user-flows/admin-user-management.md`, mapped revision markers.
- Relevant ADRs or constraints: ADR-0010 owner membership remains CLI-only; the
  first owner must already be active and verified, and only a zero-owner
  bootstrap may omit the actor.
- Related user-flow guides: `admin-user-management`.

## Plan

- [x] Implement the bounded change.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation or record why none is needed.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                         |
| ------------------------ | ------------------------------ |
| Tests                    | Passed                         |
| Lint/typecheck/build     | Backend lint/typecheck passed  |
| Runtime/browser/database | CLI list and mapped E2E passed |
| Documentation/user-flow  | Passed                         |

## Outcome and evidence

- Changes made: the CLI now strips one conventional pnpm `--` separator before
  parsing normal commands or detecting `--request-stdin`. Strict command,
  option, confirmation, and authorization validation is unchanged. Required
  mapped verification also exposed two test repeatability defects: real NGINX
  may return either 502 or 504 for an unavailable upstream, and an audit locator
  needed the current run's unique synthetic owner. Both assertions now preserve
  their original security/traceability intent while remaining rerunnable.
- Commands and results:
    - focused parser test first failed on the reproduced separator, then passed
      5/5 after the fix;
    - backend typecheck and lint passed;
    - `pnpm admin:membership -- list` traversed the real nested wrapper and read
      the local database successfully, returning an empty owner list;
    - focused real-NGINX journey passed 1/1;
    - the exact mapped composite command passed Playwright 5/5 and real NGINX
      1/1 on alternate loopback ports, preserving the user's port-4000 backend;
    - `pnpm user-flow:e2e -- check admin-user-management` and
      `pnpm docs:user-flows:check` passed (16/16 validator tests; six guides).
- Documentation: the guide now explains that membership does not create a user,
  prerequisites for local/stage bootstrap, database selection, placeholders,
  confirmation, stdin JSON privacy, verification/list commands, later-owner
  actors, remote manifest use, and the separate NGINX/application auth layers.
  Revision markers are synchronized at `sha256:7cd7a676cf5edf65`.
- Review: bounded final-diff and runtime review found no behavior or security
  policy expansion. The user's existing backend process was left running.

## Remaining risks

- A local grant will still fail, by design, when the supplied email is not an
  active verified user in the database selected by `.env.local`.
