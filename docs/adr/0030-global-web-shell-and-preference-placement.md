---
type: adr
id: ADR-0030
title: Global web shell and preference placement
status: accepted
date: 2026-10-12
supersedes: 'ADR-0007 in part: top-right language-control placement only'
---

# ADR-0030: Global web shell and preference placement

## Context

The user requested one sidebar on all web pages, an empty private-navigation area
for guests, guest Sign in/Settings footer controls, and a WIP home page. The user
approved feature delivery and replacing only ADR-0007's header-placement clause.
Existing sidebar, mobile drawer, preference controls and session infrastructure
provide the implementation seams; a separate guest header is no longer desired.

## Decision

The root layout provides one session-aware application shell for normal web pages,
including public, authentication, shared-reader and not-found pages. Desktop uses
the existing sidebar/collapsible rail; mobile uses the existing top bar/modal drawer.
The logo leads to /. Page access checks and fullscreen learning overlays remain
owned by their existing surfaces, not by navigation chrome.

Private navigation and creation controls require an authenticated session; gate
navigation requests and scope private navigation cache by user identity. Guests
receive Sign in and Settings in the pinned footer. Session restoration presents
pending account state without exposing cached identity or premature guest actions.

Expose global language and System/Light/Dark preferences through guest Settings,
or the existing account menu when signed in. Reuse one preference composition.
An anchored popup inside a native mobile modal must stay within its modal/focus
boundary; existing popover callers retain their default portal behavior.

This supersedes only ADR-0007's top-right-header placement. Its stable URLs,
cookie/header negotiation, localized SSR, typed catalogs and preference cookies
remain binding. CSS Modules/tokens remain governed by ADR-0029.

## Alternatives considered

### Keep route-specific public and authenticated chrome

Rejected by the user: navigation structure must be consistent across pages.

### Force a permanent mobile sidebar

Rejected: the user selected the established responsive modal drawer.

### Duplicate language/theme controls or change locale persistence

Rejected: shared preference composition preserves existing behavior without a
second implementation, new backend persistence or language-prefixed routes.

## Consequences

### Positive

- Stable global navigation and globally reachable preferences for both audiences.
- Guests do not trigger or see private dictionary-navigation resources.
- Existing responsive/accessibility and preference infrastructure is reused.

### Negative

- Authentication and shared-reader pages must fit within sidebar content space.
- Preference selection on mobile requires opening the navigation drawer.

### Risks / limitations

- Session transitions must not reveal another user's cached navigation.
- Modal popup focus, Escape ordering and responsive offsets require browser proof.
- The WIP home is deliberately temporary; support and finished landing content
  remain future work, not inactive mock controls.

## Related

- [ADR-0007](0007-web-request-locale-strategy.md)
- [ADR-0005](0005-frontend-component-and-fsd-standards.md)
- [ADR-0016](0016-runtime-ui-kit-authority.md)
- [ADR-0029](0029-web-css-modules-and-geometry-tokens.md)
- [Feature](../../.agent/features/041-global-app-shell/FEATURE.md)
- [ExecPlan](../../.agent/features/041-global-app-shell/EXEC_PLAN.md)
