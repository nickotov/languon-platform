# Overlay and Feedback Primitives

Status: Complete
Owner: Codex
Created: 2026-08-18

## Problem

The first UI-kit pass includes Popover, Tooltip, and Toast components, but the
overlay implementations can be clipped by containing blocks and the toast API
requires a React context provider around every producer. The public contracts
do not yet provide dependable viewport-aware placement or decoupled global
feedback dispatch.

## Desired behavior

Popover and Tooltip render in the browser top layer and automatically flip or
shift to remain visible. Tooltip accepts caller-provided React content. A single
app-level ToastHost renders globally dispatched notifications from a Zustand
store without a provider, while retaining the queue, timing, pause, action, and
live-region behavior defined by the design system.

## Acceptance criteria

- [x] AC-1 — `design/DESIGN_SYSTEM.md` and the Tooltip, Popover, and Toast
      symbols in `design/main.pen` describe the final placement and host/store
      contracts before runtime implementation is considered complete.
- [x] AC-2 — Popover uses the native Popover API for top-layer rendering and an
      adaptive positioning engine to offset, flip, and shift content within a
      16px viewport boundary; native light dismissal, Escape, accessible naming,
      and deliberate focus behavior remain intact.
- [x] AC-3 — Tooltip accepts `ReactNode` content, renders in the top layer,
      offsets/flips/shifts within the viewport, preserves the 500ms pointer and
      immediate focus behavior, remains noninteractive, and dismisses on Escape.
- [x] AC-4 — Toasts are dispatched without React context through a Zustand store
      and rendered by one `ToastHost`; the public API supports show, dismiss, and
      clear, while the host preserves a single live region, maximum-three queue,
      localized labels, minimum-six-second lifetime, pause, and persistent action
      behavior.
- [x] AC-5 — Storybook states, focused interaction/store tests, production build,
      and real-browser narrow/wide boundary verification pass with no unresolved
      critical, high, or material medium review findings.

## Scope

### In scope

- Tooltip, Popover, and Toast design symbols and written contract.
- `shared/ui` component APIs, CSS Modules, stories, and public exports.
- Root ToastHost composition and localized notification-region label.
- A focused floating-positioning dependency in the web workspace.
- Focused tests, Storybook/browser verification, existing guide traceability,
  evidence, and independent review.

### Out of scope

- Product-specific toast producers and copy beyond the host label.
- Menu, dialog, combobox, or mobile-native overlay changes.
- A new product E2E scenario solely for library primitives already covered at
  component and Storybook browser layers.

## Constraints and risks

- Prefer the native Popover API for top-layer and dismissal behavior; positioning
  enhancement must not recreate those semantics.
- Use caller-provided localized content and labels; primitives contain no product
  copy.
- Exactly one ToastHost is composed in the public web root. Notification state is
  ephemeral client state and is never persisted or server-derived.
- No authentication, data, infrastructure, or sensitive-data boundary changes.

## User-flow documentation

- Required: No new guide. This changes reusable library primitives but adds no
  standalone product journey; Storybook and focused component tests are the
  executable acceptance surface.
- Related guide: `docs/user-flows/web-ui-kit.md` already maps the affected source
  tree and remains behaviorally accurate.
- E2E synchronization: existing `theme-preference-persistence` in
  `apps/web/tests/e2e/ui-kit.journeys.spec.ts` remains unchanged and will be
  rechecked and executed proportionally because the root UI composition changes.

## Open decisions

- None. The user explicitly selected native popover where possible, adaptive
  placement, ReactNode tooltip content, and a provider-free toast host/store API.
