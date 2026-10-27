# Delegated local admin MCP

Status: Complete
Owner: Codex
Created: 2026-10-27

## Problem

Browser automation is brittle for recurring operational setup and expense analysis.
Unrestricted database access would bypass accounting and administrative invariants.

## Desired behavior

An opt-in loopback MCP listener exposes scoped, audited administrative operations.
Owners issue expiring credentials in admin and connect Codex, Claude Code or OpenCode.
The [confirmed design](../../../docs/admin-mcp-design.md) owns the detailed decisions.
User confirmed feature delivery on 2026-10-27.

## Acceptance criteria

- AC-1 — Separate configurable localhost-only opt-in MCP command; authenticated defined tools, bounded inputs, Host/Origin protection, no arbitrary SQL or provider URLs/secrets; production fails closed.
- AC-2 — Active owners issue/list/revoke only their credentials. Issuance requires five-minute recent authentication; self-revocation requires a valid session. Hash-only secrets shown once; default30/max90days; active user/membership and expiry/revocation checked on each request.
- AC-3 — Frozen explicit read-default permissions, finite independently enforced check/grant/revoke/change bounds; no MCP credential management or authority expansion.
- AC-4 — Five-minute credential-bound write previews disclose target/before/after/reason/limits; atomic commit-time authority/version validation and durable idempotency prevent stale overwrites and duplicate adjustments.
- AC-5 — Explicit model checks record operator expense without learner charge; atomic UTC daily budgets/concurrency, default $.05/check and $.50/day, strictest existing limits, safe uncertain-outcome handling and no implicit paid checks.
- AC-6 — Exact-email lookup resolves stable identity; bounded paginated finance/history and timestamped snapshots distinguish purchases/grants, measured/estimated/unknown expenses, attributable margins and shared/unallocated costs without exposing user content.
- AC-7 — Routing, customer tariffs, provider prices, credit/operator limits and separate bounded grants/revocations preserve existing validation, ledger, publication checks and immutable history. No payment/refund recording or account deletion.
- AC-8 — Admin token metadata/activity and safe one-year audit show attribution, reason/outcome/correlation and provider expense references without secrets or user content.
- AC-9 — In-admin verified connection instructions for Codex, Claude Code and OpenCode include environment secrets, startup, readonly test and actionable troubleshooting; all three clients connect successfully.
- AC-10 — Deterministic automated security/replay/concurrency/accounting tests, disposable migration/repository tests, mapped full-stack browser journeys and independent completion/security reviews pass; critical AI regression gate remains green.

## Scope

All23 confirmed design decisions and the in-admin connection documentation requirement.
No distributed infrastructure, production deployment, arbitrary SQL, provider-secret tools,
MCP token management, payment/refund writes or account deletion.

## Constraints and risks

ADR0010/0045/0046/0047 apply. Keep actor authorization, token authority, replay receipts
and financial mutations in the same transaction. Reporting must not contend with learner
admission. Client configuration must be based on verified supported transport behavior.

## User-flow documentation

Create docs/user-flows/admin-mcp.md; update existing admin-user-management guide as
needed for navigation/issuance. Map a real browser token lifecycle journey and real
HTTP MCP/tool transaction journeys using disposable infrastructure.

## Open decisions

None requiring product input. Select bounded engineering defaults in EXEC_PLAN.md.
