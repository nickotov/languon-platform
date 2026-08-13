# User Flow Testing Guides

Status: Complete
Owner: Engineering
Created: 2026-08-13

## Problem

Feature specifications and verification evidence explain what was built and what
the implementing agent proved, but they do not give another developer a durable,
start-to-finish recipe for exercising the feature later. A person who wants to
test a completed feature must currently reconstruct environment setup, entry
points, test data, browser actions, API requests, expected results, edge cases,
and cleanup from source code and historical evidence.

That reconstruction becomes stale when related logic changes. The repository
also has no machine-checkable metadata that lets an agent discover which user-
flow guides are affected by a code change.

## Desired behavior

Completed features with a browser, API, mobile, admin, CLI, or other executable
user/system journey have current guides under `docs/user-flows/`. A guide is
named after the canonical feature slug and takes a developer from prerequisites
and environment startup through successful and failure-path verification,
expected results, automated regression commands, troubleshooting, and cleanup.

Every guide has standardized YAML frontmatter. It identifies the feature,
verification status and date, exposed surfaces, and repository paths whose
behavior the guide covers. Agents scan this metadata before implementing related
logic and update every affected guide as part of the same feature change.

The root engineering instructions and feature templates make guide creation or
updates an explicit Definition-of-Done responsibility. A lightweight repository
check rejects malformed, unindexed, or structurally incomplete guides.

The first guide documents User Authentication. It explains how to start
PostgreSQL, Redis, migrations, backend, and web; how to exercise signup,
development code `0000`, reload/refresh, logout, password login, recovery,
password change, session revocation, and passkeys in a browser; how to verify
the supported HTTP flows with `curl`; which results and security invariants to
expect; and which automated suites cover concurrency or ceremony cases that are
not sensible to reproduce manually.

## Acceptance criteria

- [x] AC-1 — Root `AGENTS.md` requires agents to discover relevant
      `docs/user-flows` guides before changing behavior and to create or update
      every affected guide before a feature is complete.
- [x] AC-2 — `docs/user-flows/README.md` defines a required frontmatter schema,
      filename convention, lifecycle, content checklist, and path-matching rules
      that work for browser, API, mobile, admin, and CLI surfaces.
- [x] AC-3 — A repository command validates every user-flow guide's filename,
      frontmatter, index entry, and required sections, and the command runs as
      part of `pnpm check`.
- [x] AC-4 — New feature templates prompt authors to decide whether user-flow
      documentation is required and to record guide validation in the ExecPlan,
      evidence, and review.
- [x] AC-5 — `docs/user-flows/user-authentication.md` provides reproducible
      local startup, browser, API, expected-result, failure/edge-case, automated
      regression, troubleshooting, and cleanup instructions for the complete
      authentication feature.
- [x] AC-6 — Authentication guide instructions use only local fake identities
      and sanitized development settings, distinguish manual HTTP coverage from
      browser-required WebAuthn ceremonies, and warn about rate limits and
      destructive cleanup.
- [x] AC-7 — Root repository documentation links the user-flow index and the new
      validation command, with no conflicting accepted ADR or runtime behavior
      change.
- [x] AC-8 — Focused guide validation, formatting, the full repository check,
      and independent review pass with all material findings resolved.

## Scope

### In scope

- Repository-wide authoring and maintenance instructions.
- Required guide frontmatter and a lightweight validator.
- Feature-plan, evidence, and review template prompts.
- User-flow documentation index and authentication guide.
- Root README/development documentation links and commands.

### Out of scope

- Changing authentication runtime behavior or public contracts.
- Replacing automated tests with manual guides.
- Requiring user-flow guides for internal refactors with no executable journey;
  those changes must explicitly record why a guide is not applicable.
- Automatically determining semantic code-to-document impact from Git diffs.
- Adding a production email provider or testing production credentials.

## Constraints and risks

- Guide steps must stay aligned with source contracts and canonical commands.
- Frontmatter paths are discovery hints for agents, not a substitute for reading
  the active feature specification or accepted ADRs.
- Manual examples must never encourage real credentials, production data, or
  destructive database resets without explicit warning.
- WebAuthn signatures cannot be meaningfully hand-authored with `curl`; passkey
  ceremonies require a supported browser/authenticator or the checked-in
  Playwright virtual-authenticator suite.
- The convention should be strict enough to prevent drift without requiring a
  new parsing dependency or imposing user-flow documentation on non-user-facing
  maintenance work.

## User-flow documentation

- Required: No separate guide. This feature establishes the documentation
  workflow itself and has no product/browser/API journey.
- Guides created or updated: `docs/user-flows/README.md` and
  `docs/user-flows/user-authentication.md`.

## Open decisions

- None. The requested repository convention and first authentication guide have
  a safe, reversible implementation with no strategic architecture impact.
