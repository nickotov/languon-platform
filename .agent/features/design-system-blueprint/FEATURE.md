# Languon design system blueprint

Status: Complete
Owner: Codex
Created: 2026-08-16

## Problem

Languon's web and mobile clients use a small set of ad hoc colors, type sizes,
and controls. They do not provide a durable visual direction, semantic token
model, theme contract, or reusable accessibility requirements from which future
screens and shared primitives can be designed consistently.

## Desired behavior

Designers and implementers have one English blueprint under `design/` that can
drive later visual generation and component implementation for the public web
and native mobile products. It defines the agreed adult warm-editorial identity,
tested light and dark colors, dimensions, type, motion, component requirements,
accessibility behavior, and a prompt-ready handoff without changing the running
applications.

## Acceptance criteria

- [x] AC-1 — `design/DESIGN_SYSTEM.md` records the agreed audience, principles,
      current-practice research, visual direction, and explicit adoption/avoidance
      guidance with primary-source links.
- [x] AC-2 — The blueprint defines exact light/dark semantic colors, token tiers,
      typography, spacing, layout, radius, elevation, icon, target-size, and motion
      foundations; intended contrast pairs meet the documented WCAG thresholds.
- [x] AC-3 — Core actions, fields, selectors, form controls, tabs, overlays,
      notifications, feedback, and content primitives have purpose, variants,
      states, interaction, accessibility, responsive, and theme requirements.
- [x] AC-4 — The accessibility contract covers WCAG 2.2 AA, keyboard and focus,
      screen readers, text scaling/reflow, touch targets, reduced motion and
      transparency, increased/forced contrast, localization, and RTL readiness.
- [x] AC-5 — The document contains a prompt-ready visual-generation brief and a
      future implementation/verification checklist aligned with ADR-0005.
- [x] AC-6 — `README.md` documents the new `design/` directory and `design/main.pen`
      contains one reusable `design system` canvas frame, while runtime public API,
      dependencies, and application behavior remain unchanged.
- [x] AC-7 — Proportional formatting, link, contrast, diff, tester, and independent
      review evidence is complete with all material findings resolved.

## Scope

### In scope

- Public learner/tutor web and native mobile visual foundations.
- A system blueprint in Markdown, including exact starter tokens and component
  requirements.
- Current design-system and language-learning benchmark analysis.
- Documentation of future design generation and implementation acceptance checks.
- Repository structure documentation and feature evidence.

### Out of scope

- Implementing CSS variables, React/React Native primitives, Storybook, themes,
  screens, product journeys, or application behavior.
- The denser admin-product variant and product-specific AI chat, lesson, course,
  workbook, onboarding, navigation, or gamification patterns.
- Selecting a cross-application runtime package or adding dependencies.

## Constraints and risks

- The canvas is a design-time token and component library, not an application
  implementation; it must remain one named frame with reusable symbols that future
  screens can instance.
- The blueprint must preserve ADR-0005: future web primitives remain under each
  application's `shared/ui`, start from native semantics, and gain colocated stories.
- Web and mobile share conceptual semantics but must retain platform-native
  behavior and accessibility APIs; application source cannot be imported across apps.
- Current locales are English, Spanish, French, and Russian. Typography must cover
  Latin and Cyrillic, and layout guidance must be ready for future RTL scripts.
- Color calculations prove only specified pairs. Future compositions and imagery
  require fresh contrast checks at implementation time.
- Trend references must inform durable rules without copying another product's
  visual identity or making transient effects foundational.

## User-flow documentation

- Required: No. This feature changes only design and repository documentation; it
  adds no executable browser, API, mobile, admin, CLI, or system journey.
- Guide: Not applicable.
- Related guides: None. Existing commands, observable behavior, expected results,
  failures, and source mappings are unchanged.
- E2E synchronization: Not applicable because no guide or runtime behavior changes.

## Open decisions

- None. Audience, platform scope, visual direction, palette, typography approach,
  motion, theme behavior, document language, and artifact format were approved.
