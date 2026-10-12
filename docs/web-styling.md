---
type: reference
title: Web component styling and geometry tokens
source_paths:
    - apps/web/src/app/styles/**
    - apps/web/scripts/style-contract.ts
    - .agents/skills/magic-patterns-css-integration/**
---

# Web styling

The web app uses colocated CSS Modules under [ADR-0029](adr/0029-web-css-modules-and-geometry-tokens.md).
Global CSS owns semantic colors/fonts, themes, native reset and app foundations.
Do not add Tailwind utilities or replace them with a global utility stylesheet.

## Tokens

Numeric suffixes mean reference CSS px at a 16px root font, not a scale index:
`--size-16: 1rem`, `--size-2: 0.125rem`. Decimal suffixes use hyphens:
`--size-12-8` represents 12.8px. Tokens preserve exact existing values; do not
round a design value silently. Root-font-relative geometry honors user font
preferences rather than forcing a 16px root.

- Dimensions and applicable typography: `--size-*`.
- Margin, padding and gap: `--space-*` aliases.
- Corner rounding: `--radius-*` and semantic radius aliases.
- Meaningful shared roles: existing control/icon/avatar/page/content-width aliases.

The authoritative definitions are in
[`geometry-tokens.css`](../apps/web/src/app/styles/geometry-tokens.css) and
[`globals.css`](../apps/web/src/app/globals.css). Legacy `--sys-*` names remain
compatibility aliases where still consumed; they do not define a second scale.

Thin borders, media-query thresholds, percentages, viewport/em units, fractions,
zero, auto, full-pill radius and genuine runtime values keep their native CSS
semantics. Media thresholds cannot generally consume ordinary custom properties.
Colors, durations, z-index and unitless line-height are not geometry tokens.

## Components and integration

Use independent meaningful element/variant classes. Keep specificity low and
neutralize necessary context with `:where()`. Class ownership must not depend on
an element's tag or incidental DOM depth. Arbitrary rich-content/icon slots may
need a narrow zero-specificity condition; do not recursively modify their children.

Use [the repository Magic Patterns integration skill](../.agents/skills/magic-patterns-css-integration/SKILL.md)
to translate complete prototype bundles and responsive/state variants into owned
CSS and tokens. Preserve source requirements and real app behavior. Static inline
presentation moves to CSS; computed drag/progress/floating geometry can remain
inline. `app/icon.tsx` uses ImageResponse/Satori, which cannot consume CSS Modules
and therefore retains its renderer-specific inline presentation.

## Checks

```sh
pnpm styles:check
pnpm --filter @languon/web test
pnpm --filter @languon/web typecheck
pnpm --filter @languon/web build
pnpm --filter @languon/web storybook:build
```

The guard checks utility strings, presentation class props, static inline styles,
directives/framework variables, eligible raw CSS lengths and unresolved geometry
tokens. It supplements—not replaces—browser, component and production checks.
The exact-value tokenization helper is a migration tool, not a formatter to run
blindly on future designs; review any new token or exception before integration.
