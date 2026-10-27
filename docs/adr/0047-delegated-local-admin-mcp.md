---
type: adr
id: ADR-0047
title: Delegated local administration through defined MCP operations
status: accepted
date: 2026-10-27
supersedes: 'None'
---

# ADR-0047: Delegated local administration through defined MCP operations

## Context

Browser automation has made local administrative setup cumbersome. The operator
wants agents to inspect usage and provider expenses and configure AI operations.
Direct SQL writes would bypass existing financial and administrative invariants.
Machine access also creates authority distinct from a browser sign-in session.

## Decision

The user confirmed the initial boundary: local development, a separate localhost
port, defined operations, and independently revocable client credentials tied to
the operator's administrator identity. Preserve application-level validation,
version checks, ledger behavior and audit. Do not expose arbitrary SQL tools.

Tokens are issued and revoked in the admin panel with a chosen expiry. The
delegation permits writes in explicitly enabled tool groups without repeating a
browser login for each MCP operation. Server-side scope and limit enforcement,
not an agent's preview/apply sequence, establish that authority. Browser token
creation requires the existing five-minute recent sign-in; metadata listing uses
a valid admin session. Immediate self-token revocation requires a valid session
without recent sign-in, an explicit containment exception to sensitive browser
mutation step-up. Initially
active owners manage only their own tokens. Disabled users and lost membership
invalidate access on the next request. The MCP cannot manage credentials.

Tokens expire: one/seven/thirty-day presets, thirty-day default, ninety-day
maximum custom lifetime. Display the secret once and store only its hash. Rotate
by creating a replacement and revoking its predecessor, not extending it.

Tokens begin read-only with separately enabled report/inspection, model-check,
routing, pricing, limit and credit-adjustment groups. Credit adjustments default
off. Payment/refund recording, account deletion and provider-secret access are
outside MCP v1; grants never create revenue.

Issued permissions include a persisted explicit allowed-action snapshot. Group
labels never authorize subsequently registered actions. New tools or broader authority require
a replacement token; UI group changes cannot expand existing credentials.

Writes require a short-lived preview reference bound to the credential and exact
change, including target, before/after values, reason and applicable limits. Apply
rechecks authority and versions; stale state requires a new preview. Exact retries
return the original receipt without repeating the mutation. Preview is disclosure,
not human approval.

Explicit model-check tools may spend operator funds within limits and record
expense; read tools and route publication never start paid checks implicitly.

Check delegations default to USD 0.05 per check, USD 0.50 per day and one active
check per token, configurable at issuance. The strictest token/application/operator
limit wins; exhausted budgets reject further work. MCP cannot alter token
ceilings. Application-limit changes require separately enabled authority and
issuance-time bounds, and never raise the delegation's own ceilings.

Grant and revocation authority is separate, with finite per-operation and daily
credit ceilings, reasons and stable retry keys. Revocation affects only available,
unreserved credits, without negative balances or changes to settled charges.

Daily budgets use UTC calendar days and atomic reservations, with conservative
reservations for uncertain upstream outcomes. Recheck authority before committing
mutations. Revocation prevents further provider calls and attempts supported
cancellation of dispatched checks, while preserving incurred expense and audit.

Paid checks atomically reserve token ceilings and existing shared operator counters.
A short dispatch-authorization transaction rechecks owner/token/action and marks the
linearization point against revocation. Unknown outcomes are conservatively held.
Account purge scrubs credentials and working/replay payloads while retaining only
pseudonymous financial references; incurred expense remains settleable.

Previews last five minutes. Reuse one-year admin audit retention without secrets
or user content. Aggregate reports use timestamped accounting snapshots; balances
and write authorization use current authoritative state. MCP starts only through
an explicit command on a configurable loopback-only port. Admin connection guides
cover Codex, Claude Code and OpenCode with verified client configuration.

The user confirmed the consolidated design and authorized feature delivery on
2026-10-27.
It specifies a distinct machine delegation
and the explicit self-revocation exception; other ADR-0010 browser authorization
rules remain in force. It does not authorize production exposure. Future super-admin
issuer permissions are an intent, not a role implemented in today's owner model.

## Alternatives considered

### Unrestricted database tools

Flexible, but permit bypassing credit-ledger, tariff, audit and concurrency rules.
Rejected for the administrative MCP boundary.

### Browser automation alone

Retains current UI behavior, but is slow and brittle for recurring agent-operated
setup and inspection. It remains useful for verifying the administrative UI.

### Shared password and public listener

Does not provide independently revocable client attribution. Public exposure is
outside the approved first release.

## Consequences

### Positive

- Reuses established administrative business rules and attribution.
- Separates per-client delegation from the administrator's personal credentials.

### Negative

- Requires explicit operation contracts and adapters, rather than generic SQL.
- Some current HTTP orchestration needs a reusable application-level boundary.

### Risks / limitations

- Client compatibility, atomic quota/replay enforcement and bounded reporting
  require implementation evidence; these documents do not establish them.
- This decision is design documentation, not evidence of an implemented server.

## Related

- [Design interview](../admin-mcp-design.md)
- [ADR-0010](0010-admin-application-and-authorization.md)
- [ADR-0045](0045-action-accounting-and-provider-expenses.md)
- [ADR-0046](0046-admin-owned-text-ai-routing.md)
