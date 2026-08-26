# ADR-0008: Web UI kit and design-source authority

Status: Superseded by ADR-0016
Date: 2026-08-17
Supersedes: None

## Context

The public web app needs reusable UI primitives and a durable visual source of truth.

## Decision

Keep web primitives app-local under `apps/web/src/fsd/shared/ui`. `design/` is
authoritative for visual tokens and component semantics; global semantic CSS
variables, CSS Modules, and Storybook stories implement that contract. Prefer
native HTML and use advanced primitives only for necessary accessibility behavior.

## Alternatives considered

### Cross-application runtime package

Rejected because mobile requires platform-native implementations.

### Storybook as the source of truth

Rejected because it cannot replace the design contract and editable board.

## Consequences

### Positive

- Future UI changes have one reviewed visual contract.

### Negative

- Design, stories, and runtime styles require synchronized updates.

## Risks / limitations

- Components still need browser and assistive-technology verification.

## Related

- [ADR-0005](./0005-frontend-component-and-fsd-standards.md)
- `design/DESIGN_SYSTEM.md`
- `.agent/features/web-ui-kit/EXEC_PLAN.md`
