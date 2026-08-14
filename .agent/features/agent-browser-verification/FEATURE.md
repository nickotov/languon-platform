# Agent Browser Verification

Status: Complete
Owner: Engineering agents
Created: 2026-08-14

## Problem

Agents currently use Playwright MCP for both exploratory real-browser checks and
the repository's committed Playwright E2E suite. The interactive path carries
more tooling overhead than necessary and obscures the distinction between
acceptance evidence gathered by an agent and repeatable automated E2E coverage.

## Desired behavior

The repository provides a pinned `agent-browser` installation and a safe local
wrapper. Agents use it by default for real-browser inspection of running web and
admin applications, while Playwright remains the framework for committed E2E
tests. The browser-verification workflow captures accessibility snapshots,
responsive screenshots when useful, console errors, and failed requests, then
closes its isolated session.

## Acceptance criteria

- [x] AC-1 — A fresh checkout can install the pinned `agent-browser` package and
      its browser runtime through canonical root commands.
- [x] AC-2 — Codex no longer presents Playwright MCP as the interactive browser;
      agents invoke the project-pinned `agent-browser` CLI through the terminal.
- [x] AC-3 — Repository instructions and the browser-verification skill make
      `agent-browser` the default for exploratory real-app verification and
      reserve Playwright for repeatable E2E tests.
- [x] AC-4 — The documented workflow covers isolated sessions, accessibility
      snapshots, viewports, console/network inspection, artifacts, cleanup, and
      safe local test data.
- [x] AC-5 — Formatting, static checks, package metadata, and a live
      `agent-browser` smoke journey pass.

## Scope

### In scope

- Pin `agent-browser` as a root development dependency.
- Add root commands for browser installation and diagnostics.
- Remove the project-scoped Playwright MCP entry and use the pinned CLI through
  the existing command-execution approval boundary.
- Configure content boundaries and bounded page output.
- Add a tested wrapper that enforces explicit project configuration, unique
  sessions, local-only origins, clean environment overrides, and a safe command
  allowlist.
- Update agent instructions, the browser-verification skill, and developer
  documentation with the verification/E2E boundary and command recipe.

### Out of scope

- Rewriting or removing the existing Playwright E2E suite.
- Generating E2E tests from exploratory browser sessions.
- Adding cloud browser providers, persistent real credentials, or CI browser
  verification.
- Changing product behavior in web, admin, backend, or mobile applications.

## Constraints and risks

- Browser pages are untrusted input. Use content boundaries, fake local data,
  isolated sessions, bounded output, and no real credentials or personal data.
- Browser installation downloads a Chrome runtime and may need explicit network
  approval or Linux system packages.
- The project supports Node.js 24 and pnpm 10. The security-hardened pinned
  release declares pnpm 11 in its package metadata, so the consumer install,
  frozen lockfile, wrapper, runtime installation, and browser launch must remain
  verified with the repository-pinned pnpm 10 toolchain.
- Playwright remains installed in `apps/web` and remains the E2E runner.

## User-flow documentation

- Required: No. This changes internal developer/agent tooling, not an executable
  Languon product journey. Canonical setup and verification commands belong in
  `README.md` and `docs/agentic-development.md`.
- Guide: Not applicable for the reason above.
- Related guides: None; no product behavior or mapped source path changes.
- E2E synchronization: Not applicable; existing Playwright scenarios are
  intentionally unchanged.

## Open decisions

- None. The user explicitly selected `agent-browser` for agent verification and
  Playwright for E2E tests.
