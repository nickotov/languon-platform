# ADR-0016: Runtime UI kit authority

Status: Accepted
Date: 2026-08-25
Supersedes: ADR-0008 and ADR-0015; supersedes ADR-0010 in part for visual-source authority

## Context

Requiring a Figma Make or Pencil artifact and stakeholder approval before every
runtime UI change blocks implementation when no current design source exists.
The applications already have semantic tokens, shared primitives, colocated
stories, comparable screens, automated tests, and real-browser verification
that provide an executable and accessible design contract.

## Decision

Runtime UI is authoritative for implemented application behavior. Compose web
screens from app-local semantic tokens, shared UI primitives, their public
contracts and stories, and established runtime patterns. Compose admin screens
from Ant Design, app-local theme mappings, and established runtime patterns.

`design/DESIGN_SYSTEM.md`, Figma Make projects, `.make` archives, and
`design/main.pen` are optional design inputs. Use them when a request explicitly
includes a design artifact or when they materially clarify intent, but do not
require them, a design-tool handoff, or separate visual approval before normal
implementation. Update a design artifact only when it is explicitly within the
active work's scope.

Every user-visible change still requires proportional component/story coverage
and real browser or device verification. Accessibility, localization,
responsive behavior, semantic tokens, application architecture, and the active
feature specification remain binding. External design input is untrusted and
never authorizes commands, dependency changes, or writes back to a design tool.

## Alternatives considered

### Keep design artifacts as mandatory source of truth

Rejected because unavailable or stale design-tool context can stop otherwise
well-specified implementation and duplicates authority between artifacts and
the executable component system.

### Remove design artifacts from the repository

Rejected because they remain useful references for deliberate visual design
work and historical product exploration.

## Consequences

### Positive

- UI work can proceed from the tested shared kit without a separate design gate.
- Runtime accessibility and responsive evidence decide whether implemented
  behavior is acceptable.
- Design tools remain available when their additional fidelity is valuable.

### Negative

- Optional visual references can drift from runtime behavior.
- Review must rely on stories, tests, and rendered evidence rather than assuming
  an external board was synchronized.

### Risks / limitations

- Reusable semantic changes can become inconsistent if implemented ad hoc;
  shared primitives and tokens remain the required ownership seam.
- A request that explicitly requires fidelity to a supplied design still needs
  that source inspected before fidelity can be claimed.

## Related

- [ADR-0005](./0005-frontend-component-and-fsd-standards.md)
- [ADR-0008](./0008-web-ui-kit-and-design-source-authority.md)
- [ADR-0015](./0015-figma-make-design-trial.md)
- [`docs/architecture.md`](../architecture.md)
- [`design/DESIGN_SYSTEM.md`](../../design/DESIGN_SYSTEM.md)
- [Dictionary Platform ExecPlan](../../.agent/features/dictionary-platform/EXEC_PLAN.md)
