---
type: adr
id: ADR-0029
title: 'Web CSS Modules and geometry tokens'
status: accepted
date: 2026-10-12
supersedes: 'ADR-0017 in part: Tailwind styling requirement only'
---

# ADR-0029: Web CSS Modules and geometry tokens

## Context

The web app mixes Tailwind utility strings with CSS Modules. The user explicitly
requested a single CSS-file styling system, shared dimension/spacing/radius scales,
conversion of Magic Patterns utilities during integration, and authorized feature
delivery of this migration. This replaces ADR-0017's styling mechanism, not its
design-token fidelity or Next development/production compiler decisions.

## Decision

Use colocated CSS Modules for web component presentation. Global CSS owns only
theme/token, reset and application foundations; do not rebuild a global utility
framework. Use meaningful explicit element/variant classes, pseudo states and
zero-specificity contextual conditions. Retain accessible HTML and shared primitives.

Canonical numeric geometry tokens use suffixes corresponding to reference CSS px
at a 16px root font: `--size-16: 1rem`. Dimensions use `--size-*`; spacing uses
`--space-*` aliases; radii use `--radius-*`. Semantic aliases describe controls,
icons, avatars, page padding and content widths. Preserve actual values, including
irregular values, rather than snapping existing layouts to an approximate scale.
Rem lengths intentionally honor user root-font preferences; do not force the root
font size. Thin borders, media thresholds, percentages, viewport lengths, fractions,
zero, auto and genuinely runtime values are not blindly tokenized.

Magic Patterns code is a design specification. Convert utility bundles and their
responsive/theme/interactive variants into the owning CSS Module and app tokens.
Preserve selected-design hierarchy, controls, states and accepted values; record
material deviations instead of silently approximating them. Repository-owned
integration guidance applies; do not modify installed plugin caches.

Static inline presentation belongs in CSS. Runtime drag transforms, measured
positions and calculated progress remain inline or custom properties. Preserve
required native-control and border/font reset behavior explicitly when removing
Tailwind. Remove its dependency/config/directives only after all consumers migrate.

## Alternatives considered

### Keep the hybrid system

Rejected by the user: two mechanisms complicate ownership and future integrations.

### Recreate Tailwind as global utility classes

Rejected: moves the same utility mechanism into handwritten CSS instead of adopting
the requested component ownership and explicit class contracts.

### Round every value to a small spacing scale

Rejected: would redesign existing UI and repeat the visual drift that motivated
ADR-0017. Tokenize exact values before any separately requested design cleanup.

## Consequences

- One component styling mechanism and shared geometry vocabulary.
- Future prototypes need explicit translation rather than copied class strings.
- Removing Preflight requires maintained native reset and browser evidence.
- Root-font-relative geometry may scale differently under user font preferences.
- Token/utility guards, production/catalog builds and real-browser verification
  protect the migration; source inspection alone is insufficient.

## Related

- [ADR-0017](0017-magic-patterns-tailwind-ui-contract.md) remains accepted for its
  unaffected token-fidelity and compiler decisions.
- [ADR-0005](0005-frontend-component-and-fsd-standards.md)
- [ADR-0016](0016-runtime-ui-kit-authority.md)
- [Feature](../../.agent/features/040-web-css-modules-migration/FEATURE.md)
- [ExecPlan](../../.agent/features/040-web-css-modules-migration/EXEC_PLAN.md)
