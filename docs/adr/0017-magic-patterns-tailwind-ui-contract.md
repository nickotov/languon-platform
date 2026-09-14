# ADR-0017: Magic Patterns Tailwind UI contract

Status: Accepted
Date: 2026-09-14
Supersedes: None

## Context

The web UI is being rebuilt from the supplied Magic Patterns Languon design system and auth artifact. Those artifacts define an exact CSS-variable token contract and use Tailwind CSS v3 utilities for composition. Re-expressing the screens through approximate legacy CSS Modules produced visible drift.

## Decision

Use the supplied Magic Patterns token names and values as the web runtime design-token contract. Configure Tailwind CSS v3 in `apps/web` to expose those variables as semantic utilities. Shared primitives remain app-local and follow FSD/public-export/story rules; CSS Modules remain supported for existing and component-specific styling. Magic mock data, Vite/router scaffolding, and unsupported product behavior are never copied.

Use Next's webpack production builder explicitly for `apps/web` while keeping Turbopack for the development server. During implementation the Next 16.3 default Turbopack production builder repeatedly stalled without diagnostics while the equivalent webpack build completed and generated every route. This preserves fast Turbopack development feedback while making the canonical production build deterministic; the split should be removed once the upstream production-builder stall is reproducibly resolved.

## Alternatives considered

### Continue translating into legacy `--sys-*` tokens only

Rejected because the translation had already drifted from the approved ramps, typography, radii, elevation, and component composition.

### Copy the standalone Magic application verbatim

Rejected because its mock authentication, router, and simulation layer conflict with the real Next.js application and authentication contracts.

## Consequences

### Positive

- Runtime classes and CSS variables map directly to the approved design.
- Future Magic components can be integrated without inventing a second visual vocabulary.

### Negative

- The web workspace gains Tailwind/PostCSS build dependencies and Lucide/Inter runtime dependencies.
- Existing `--sys-*` consumers need compatibility aliases until migrated.
- Development and production temporarily use different Next compilers, so both the Turbopack development journey and webpack production build must remain in verification until the production-builder stall is resolved.

### Risks / limitations

- Visual fidelity does not authorize fake OAuth, role, consent, or session-duration behavior; those require separate product/backend features.

## Related

- [ADR-0005](./0005-frontend-component-and-fsd-standards.md)
- [ADR-0016](./0016-runtime-ui-kit-authority.md)
- [Feature specification](../../.agent/features/magic-patterns-ui-kit-auth-fidelity/FEATURE.md)
- [Execution plan](../../.agent/features/magic-patterns-ui-kit-auth-fidelity/EXEC_PLAN.md)
