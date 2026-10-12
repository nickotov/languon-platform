# Web CSS Modules and token migration

Status: Complete
Owner: Root
Created: 2026-10-12

## Problem and authorization

The web app mixes Tailwind utilities and CSS Modules, complicating Magic Patterns
integration and leaving static geometry literals distributed across components.
The user approved the proposed migration and explicitly authorized feature delivery
on a separate branch. Baseline main: c3e848e. No unrelated dirty work exists.

## Desired behavior and acceptance criteria

- AC-1 — CSS Modules are the sole component styling system; no Tailwind utilities,
  directives, configuration or dependency remain in the web workspace, including
  stories. Static inline presentation moves into CSS; genuine runtime geometry remains.
- AC-2 — All web CSS uses canonical size, space and radius tokens for eligible
  dimensions/spacing/radii. Preserve values at a 16px root; rem scales respect user
  font settings. Keep semantic aliases. Percentages, viewport units, grid fractions,
  zero, auto, thin borders, media thresholds and runtime calculations remain appropriate.
- AC-3 — Preserve the implemented UI: responsive layouts, typography, light/dark/system
  themes, focus, disabled/loading/error states, dialogs, flashcard gestures and sentence
  training. Preserve necessary Preflight reset and inherited border/font defaults.
- AC-4 — Repository-owned Magic Patterns integration guidance requires conversion to
  named low-specificity CSS classes and tokens, preserving selected-design fidelity.
  Do not modify plugin caches. Update governing frontend instructions and accepted ADR.
- AC-5 — Add a meaningful guard against utility/directive reintroduction and untokenized
  eligible CSS. Validate with web tests/static/production/catalog checks, affected real
  browser/E2E journeys, independent completion review and skill validation.

## Scope

Web runtime/styles/stories, styling tooling, ADR/instructions/skills and relevant
current UI-kit guide. No new product journey, API, database migration, permission,
AI invocation, production service or application redesign. Admin/mobile untouched.

## Constraints and decisions

Supersede ADR-0017 in part for styling only, retaining its compiler split and exact
design color/font contract. Global tokens/reset remain app-local; no global utility
replacement stylesheet. Scope is current runtime fidelity, not a new external design
handoff. Low-specificity class selectors remain the component contract.

## User-flow documentation

Update existing docs/user-flows/web-ui-kit.md for the new styling foundation and
guard; synchronize its existing theme-preference-persistence mapped test. Other
current app guides have unchanged journeys and source mappings; execute representative
existing dictionary/training journeys rather than create a fictitious new journey.
No standalone migration user-flow guide: this changes implementation of existing
journeys, not an executable user capability. Feature is not tied to a backlog task.
