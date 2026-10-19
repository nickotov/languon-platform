# Development cleanup and architecture diagrams

Status: Complete
Owner: Codex
Created: 2026-10-19

## Problem and authorization

The application is in development with no deployed production data. Obsolete
compatibility paths obscure current behavior; architecture diagrams are limited
to a coarse text sketch. The user requested reusable cleanup and diagram skills,
a cleanup run, and a minimal browser viewer. After read-only discovery and an
explicit feature-authorization request, the user said “commit firstly, then
continue”. Checkpoint007b9eb preserves preceding user work; delivery starts there.

## Desired behavior and acceptance criteria

- AC-1 — A discoverable development-cleanup skill audits reachability, compatibility
  and obsolete model/configuration/data paths, removes evidenced stale code, and
  routes validation and local data cleanup safely through repository policies.
- AC-2 — Run that skill across runtime code and review stale/compatibility
  candidates; remove obsolete DeepSeek Chat support and other proven obsolete
  paths in the audited scope, including unused source shims and the superseded
  dictionary-audio protocol where current shared speech has replaced its callers.
  Record candidates, evidence, removals and retained
  current behavior. Preserve current DeepSeek Flash and Kie capabilities.
- AC-3 — A discoverable architecture-diagrams skill creates or updates diagrams
  from code, accepted ADRs and current docs, recording sources and disagreements.
- AC-4 — Maintain navigable diagrams for system boundaries, backend/frontend
  structure, authentication, asynchronous AI/accounting, dictionaries/learning,
  texts, conversations/Knowledge, audio and local operational flows. Distinguish
  actual behavior, planned components and discrepancies; diagrams have inspectable
  sources and freshness evidence tied to inputs.
- AC-5 — A thin loopback-only read-only server presents diagrams in a minimal,
  responsive, accessible browser UI with selection, search, zoom/fit and source
  inspection. All browser assets are local; no arbitrary file serving, command
  execution, database mutation or external requests.
- AC-6 — Focused automated checks, real browser evidence, relevant disposable DB
  verification, guide traceability, independent completion/security review and
  necessary remediation pass for the final patch.

## Scope and constraints

Repository-local skills under .agents/skills; a bounded cleanup run over runtime
code/configuration/tests; source-backed diagrams under docs/diagrams; local viewer
under scripts/architecture-viewer. Historical ADR/feature/evidence records remain
historical evidence rather than executable compatibility. Never infer obsolescence
from age, comments or spelling alone. Remove adapters after tracing callers,
indirect registration, configuration and persisted references. Development data
may be cleaned for demonstrated necessity on an explicitly verified local target;
prefer targeted cleanup and disposable verification over destroying all data.

Existing security and accounting invariants remain applicable. Supersede accepted
ADR compatibility rules when a development-only retirement changes their scope.
No remote deployment, paid providers, shared data operations or branch push.
No supplied design; compose a small functional developer UI.

## User-flow documentation

Create docs/user-flows/development-cleanup-and-architecture-diagrams.md for the
viewer/diagram validation journey. Update model/harness guides whose real commands
or expected results change and keep their mapped E2E revisions current. Existing
panel remains a separate execution authority. No matching backlog task.

## Open decisions

None requiring product input; choose routine implementation through existing
architecture and record consequential choices in EXEC_PLAN.md.
