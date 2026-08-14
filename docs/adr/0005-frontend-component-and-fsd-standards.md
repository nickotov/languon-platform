# ADR-0005: Frontend component and FSD standards

Status: Accepted
Date: 2026-08-14
Supersedes: None

## Context

The web and admin applications already use pages-first Feature-Sliced Design,
but component anatomy, logic placement, shared design-system ownership, and
state communication are not defined precisely or enforced. Conventions that
exist only in conversation are easy to lose, while unrestricted imports allow
new code to invert layers or couple sibling slices.

## Decision

Use the `app -> pages -> widgets -> features -> entities -> shared` dependency
direction in both Next.js applications and enforce it with
`eslint-plugin-boundaries`, including TypeScript path-alias resolution. Disallow
same-layer cross-slice imports while allowing internal imports inside one slice.

Organize components below a slice's `ui` segment in one-component folders,
normally pairing TSX with a CSS Module. Place React logic in `hooks`, pure
helpers in `lib`, state and global feature/entity interfaces in `model`, remote
access in `api`, and types in `types.ts`. Put design-system primitives in
`shared/ui` with colocated stories. Prefer semantic native elements before
custom advanced UI behavior.

Avoid prop drilling through unrelated intermediaries. Choose scoped context,
Zustand, TanStack Query, or typed events based on state ownership and lifetime.
When events are justified, keep the generic typed bus in `shared/lib` and do not
use it as authoritative state or an implicit request/response channel.

The project-local `$frontend-development` skill is the procedural source for
applying these rules. Slice public entry points remain required once a slice
exposes multiple modules; a one-file slice does not require an otherwise empty
barrel.

## Alternatives considered

### Documentation without lint enforcement

This is simple but detects violations only during review and does not reliably
cover aliased imports.

### A custom ESLint plugin or path checker

This could encode every repository detail but adds unnecessary maintenance.
The stable boundaries plugin already models elements, layers, and aliases.

### One global component or event architecture

Forcing every component into shared UI or every interaction through a store or
event bus obscures ownership. State and components remain local until they have
independent consumers or genuinely shared lifetimes.

## Consequences

### Positive

- Agents and developers receive one discoverable, repeatable frontend workflow.
- ESLint catches upward and sibling-slice imports, including `@/*` aliases.
- UI, state, API, and helper ownership remain visible from the filesystem.
- Shared primitives are documented through stories and start from accessible
  platform semantics.

### Negative

- Frontend additions may require more small folders and files.
- The root lint toolchain gains a boundaries plugin and TypeScript resolver.
- Existing or future intentional boundary exceptions require an explicit,
  reviewed configuration decision.

### Risks / limitations

- ESLint can enforce import direction but cannot prove good component anatomy,
  correct state ownership, accessibility, or story quality; skill guidance,
  tests, review, and browser verification remain necessary.
- `shared` is one architectural element, so lint does not prevent every form of
  coupling between subfolders inside `shared`.

## Related

- [`docs/architecture.md`](../architecture.md)
- [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md)
- [`apps/admin/AGENTS.md`](../../apps/admin/AGENTS.md)
- [Frontend Development skill](../../.agents/skills/frontend-development/SKILL.md)
- [Feature specification](../../.agent/features/frontend-development-standards/FEATURE.md)
- [Execution plan](../../.agent/features/frontend-development-standards/EXEC_PLAN.md)
