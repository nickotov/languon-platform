# Lightweight improvements and Figma Make design workflow

Status: Complete
Owner: Codex
Created: 2026-08-23

## Problem

Focused work such as a small dev-panel UI improvement or introducing Prettier
can be routed into the full feature lifecycle despite needing only one bounded,
reversible delivery. Visual work also names Pencil as the sole design source,
although the team wants to trial the committed Figma Make project through Figma
MCP.

## Desired behavior

Agents route corrections, focused improvements, and explicitly requested
features through distinct workflows. Figma Make becomes the preferred visual
composition source when MCP can access the cloud project; legacy Pencil remains
available for unmigrated screens and unavailable Figma context.

## Acceptance criteria

- [x] AC-1 — Add a repository-local improvement skill, template, and root
      routing rules that cover modest developer, tooling, and existing-contract UX
      improvements without starting feature delivery.
- [x] AC-2 — Enter `$feature-development` only when the user explicitly asks to
      create a feature or use the full feature lifecycle; high-risk implicit requests
      must pause for that authorization.
- [x] AC-3 — Configure Figma MCP and document a safe Figma Make design-to-code
      workflow that preserves `DESIGN_SYSTEM.md`, avoids hand-editing `.make`, and
      uses Pencil only as the unmigrated/unavailable fallback.
- [x] AC-4 — Validate instructions, documentation, configuration, and independent
      review; record the limitation that the local archive has no supplied Make
      project link.

## Scope

### In scope

- Agent routing, local skills, templates, developer/architecture documentation,
  Figma MCP configuration, design-source authority, and the committed Make file.

### Out of scope

- Implementing a product UI, migrating all Pencil boards, changing the Figma
  project itself, production dependencies, CI enforcement, or a feature-capability
  policy change.

## Constraints and risks

- The improvement flow cannot bypass public-contract, data, security, production
  dependency, migration, deployment, or ADR boundaries.
- Figma Make context requires a valid Make project link and MCP resource support.
  No Make link was provided for the local archive.
- ADR-0008 remains active; ADR-0015 records the staged Figma Make transition.

## User-flow documentation

- Required: No. This changes agent documentation and local tooling configuration,
  not an executable user journey or reviewed command behavior.
- Related guides: None.
- E2E synchronization: Not applicable.

## Open decisions

- None. The user requested the Figma Make trial; the shared Make project link is
  a future handoff, not a decision needed to complete this change.
