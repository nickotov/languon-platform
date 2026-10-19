---
type: adr
id: ADR-0039
title: Source-backed local diagram atlas
status: accepted
date: 2026-10-19
supersedes: None
---

# ADR-0039: Source-backed local diagram atlas

## Context

Developers need inspectable diagrams describing implemented flows and exposing
drift from recorded code and accepted decisions. The user requests a thin local
server with a minimal browser interface. The command panel under ADR-0014 owns
executable process controls and private sessions; diagram browsing needs neither
that authority nor product application credentials.

## Decision

Maintain each view in `docs/diagrams/<slug>.md`. Its frontmatter owns the title,
summary, exact source paths, aggregate fingerprint and source-review date. One
Mermaid block and nearby notes describe implementation and discrepancies. Discover
the catalog from those documents without a second manifest. Hashes detect changed
recorded inputs; updating them is an explicit operation after reconciliation.
Equality cannot prove completeness or discover new modules.

Use a separate native Node read-only server started with `pnpm diagrams`, bound
only to127.0.0.1, default port4401. Refuse an occupied port; accept an explicit
alternative port. Serve fixed client assets, allowlisted local Mermaid modules
and the parsed diagram catalog. Confine files by canonical paths, validate metadata
with Zod, bound document/source sizes and reject unsupported writes. Require exact
loopback Host and reject foreign Origin/cross-site requests without CORS.
There is no command, database, arbitrary-source-file or environment API.

Render Mermaid with strict security and encoded text labels. Reject directives,
links, HTML and external resources; insert other content as text. Serve assets
locally with a restrictive CSP, allowing inline styles for Mermaid SVG geometry.
Mermaid, its Node parser DOM, Zod and the browser runner are development dependencies
excluded from product deployment artifacts.

The viewer serves repository diagram documentation to local users without login.
It is not an operating-system-user isolation boundary. Diagrams must contain no
secrets or user data. Command-panel execution/session rules stay authoritative for
its separate controls.

## Alternatives considered

### Add browsing routes to the command panel

Would couple documentation rendering dependencies and content with privileged
process controls. A separate small server keeps lifecycle and authority focused.

### CDN rendering or a generic repository file server

Would add external requests or expose unrelated source/configuration. Fixed assets
and a bounded catalog meet the requested use case.

### Generate diagrams from imports alone

Import graphs miss admission, ownership, configuration, worker and accounting
semantics. Reviewed source tracing explains those relationships; hashes signal
drift rather than replacing semantic review.

## Consequences

Developers can navigate and inspect versioned diagrams offline after dependency
installation. The atlas adds a small HTTP/rendering test surface and needs deliberate
maintenance. Browser checks prove presentation; source review establishes meaning.

## Related

- [ADR-0014](0014-web-dev-panel-local-quick-access-sections.md)
- [ADR-0016](0016-runtime-ui-kit-authority.md)
- [Diagram atlas](../diagrams/README.md)
- [Feature 045](../../.agent/features/045-development-cleanup-and-architecture-diagrams/FEATURE.md)
