---
type: design
title: Delegated local administration through MCP
status: current
date: 2026-10-27
source_paths:
    - apps/backend/src/modules/administration
    - apps/backend/src/modules/ai-credits
    - apps/backend/src/modules/text-ai
---

# Delegated local administration through MCP

The user confirmed this consolidated scope and authorized feature implementation
on 2026-10-27. Delivery evidence lives in
[feature056](../.agent/features/056-admin-mcp/EVIDENCE.md). Confirmation does not
authorize production deployment or implicit paid provider calls.

## Intended outcome

Let the operator's agent inspect transactions, providers, models and expenses,
including expenses attributable to a learner identified by email, and perform
explicit administrative changes such as publishing prices and changing limits.
The agent should not need browser automation to perform these operations.

## Confirmed decisions

1. Launch for local development only, on a separate localhost port. Production
   access requires a separate explicit security/deployment design before enabling.
2. Expose defined operations. Database access remains internal to application
   operations; the agent receives no arbitrary SQL execution tool. Writes preserve
   validated business rules, financial invariants and audit records.
3. Initially one operator uses the server. Each client has independently
   revocable credentials tied to that operator's administrator identity, rather
   than a shared password.
4. Issue tokens in the admin panel, with a chosen expiry and revocation controls.
   Tokens are linked to a user identity. Future issuer/revoker restrictions may
   introduce a super-admin role; today's owner-only model does not already
   provide that role.
5. An issued delegation authorizes writes in explicitly enabled tool groups,
   within server-enforced limits, audit, version checks and replay protection.
   No additional browser login is required for each authorized MCP write. A
   preview is useful change disclosure, not independent human approval when the
   agent can invoke both preview and apply. Token possession exercises its scope.
6. Explicitly requested model checks may spend operator funds within spending and
   execution limits, record provider expense and never charge learners. Reports
   and model listings never silently invoke paid checks. Route publication that
   lacks checks returns that requirement rather than generating them implicitly.
7. Initially active owners issue and revoke only their own tokens. Tokens never
   grant admin status to learners. Disabling the owner or removing active admin
   membership invalidates token access on the next request. MCP cannot issue
   credentials or expand its own permissions.
8. Expiry presets are one day, seven days and thirty days; default thirty days.
   Custom expiry is at most ninety days, with no permanent credentials. Show the
   secret once, retain only its hash, and replace credentials by issuing a new
   token and revoking the old one rather than extending the old secret.
9. Tokens start read-only. Independently selectable groups cover user lookup,
   credit history and financial reports; provider/model inspection; paid model
   checks; routing changes; customer tariffs and provider prices; credit and
   operator spending limits. Include credit grant/revocation tools as a separate
   write group disabled by default. Payment/refund recording, account deletion,
   provider-secret access and token management are excluded from MCP v1. Credit
   grants do not constitute revenue.
10. Creating a token requires the existing five-minute recent-sign-in check.
    Listing token metadata requires a valid admin session. Owners may immediately
    revoke their own tokens with a valid admin session, without recent-sign-in
    step-up; document this explicit containment exception.
11. Writes require a preview showing target, current/proposed values, reason and
    applicable limits. Apply uses a short-lived reference bound to the credential
    and exact change. Recheck permissions and versions; stale state requires a
    fresh preview. Exact retries return the original receipt without repeating
    the mutation. Preview is disclosure, not human approval.
12. Permission groups simplify issuance UI, but issued authority is explicit and
    frozen. New tools or broader authority require a replacement token; adding a
    tool to a group never silently expands existing credentials.
13. Tokens with paid-check permission have explicit USD ceilings per check and
    per day plus concurrency limits. Initial issuance defaults: USD 0.05 per
    check, USD 0.50 per day, one active check per token. These are editable during
    issuance. Existing application/operator limits also apply; the strictest wins.
    Exhaustion rejects checks and never increases budgets automatically.
14. Token ceilings cannot be changed through MCP. Application spending settings
    may change only within explicitly delegated bounds set at issuance; raising
    them never raises the token's own ceiling. Limit-changing permission defaults
    off.
15. Credit grants and revocations have separate permissions and explicit
    per-operation and daily ceilings, with no unlimited option. Require a reason
    and stable retry key. Revoke only available, unreserved credits; never create
    negative balances or alter settled charges. Grants remain non-revenue
    adjustments.
16. Resolve exact email lookup to a stable user ID. Financial reports accept a
    date range (default thirty UTC calendar days including the current day) and
    paginate detailed records. The default ends at the next UTC midnight so its
    snapshot key remains stable throughout the day. Mark today's totals as
    partial and show the report update timestamp. Show
    provider expenses with measured/estimated/unknown distinctions; credits
    charged/granted/revoked and current availability; recorded purchase revenue
    excluding grants; and attributable margin with uncertainty. Keep shared
    operator expenses and unallocated invoice adjustments separate. Exclude chat,
    prompt and document contents.
17. Recheck authority before committing configuration or credit changes; reject
    if credentials expired, were revoked or the owner lost access. For already
    dispatched paid checks, attempt supported cancellation, retain expenses and
    audit, and prevent further provider calls. Revocation cannot undo upstream
    expenses already incurred.
18. Daily ceilings use UTC calendar days with visible reset times. Atomically
    reserve check budgets before dispatch and settle against recorded expense.
    Retain conservative reservations for uncertain outcomes, never equate unknown
    cost with zero, and never blindly retry potentially running checks. Reusing
    an operation key returns its existing status instead of dispatching again.
19. MCP is opt-in through a dedicated command, with a configurable localhost-only
    port. Provide copyable client configuration referencing a local environment
    variable for the secret; never place credentials in URLs, committed files or
    logs. Production access remains disabled.
20. Write previews expire after five minutes and permit one committed change.
    Retries of an applied operation return its receipt. Expiry requires a new
    preview; permission or version changes invalidate it immediately. Read-only
    operations do not require previews.
21. Admin shows token name, owner, creation/expiry, explicit permissions, limits,
    last use and revocation status. Operation audit includes actor, token ID,
    target, reason, outcome, correlation ID and safe change details. Paid checks
    link to provider expense. Never retain secrets or user content in audit;
    reuse the existing one-year admin audit retention policy.
22. Reuse existing accounting snapshots for aggregate reports and show their
    update timestamp. Paginate transaction details with bounded date ranges.
    Balance reads and write authorization use current authoritative data.
    Expensive reports must not block learner generation.
23. First release includes token management, connection guides, reports, explicit
    model checks, routing, prices, spending limits and bounded credit adjustments.
    Verify all three supported clients can connect. Automated coverage must
    include expired/revoked credentials, permission denial, stale previews,
    duplicate requests, concurrent budget enforcement and financial invariants.
    Normal tests use deterministic provider fixtures; real paid checks remain
    explicit operations.

## Additional confirmed requirements

- Include connection instructions inside the admin panel for Codex, Claude Code
  and OpenCode. Explain local startup, credential environment-variable setup,
  copyable client configuration, a read-only connection test and troubleshooting.
  Verify supported client configuration against primary documentation before
  implementation; do not invent configuration formats or imply unsupported
  environment-variable expansion. Token secrets remain visible only at issuance.

## Existing implementation constraints

- ADR-0010 requires active server-side owner membership, administrator audit and
  recent authentication for sensitive browser mutations. A distinct machine
  delegation cannot silently waive this policy; its authority must be specified.
- Existing accounting distinguishes customer credits, actual recorded payments,
  provider expenses, deposits and unknown/estimated costs (ADR-0045). Reports
  must retain these distinctions; granting credits does not create revenue.
- Provider/model routes are curated, versioned and checked (ADR-0046). An MCP
  operation must not introduce arbitrary upstream URLs or bypass activation checks.
- Existing admin services and transaction participants already enforce versions,
  reasons, locks, audit and ledger behavior. Reuse their application boundaries;
  some capabilities currently compose directly inside HTTP route handlers.
- Email lookup and user credit history exist. A complete per-learner provider
  expense report is not an existing verified application query and needs its own
  bounded reporting operation with explicit attribution rules.
- Accounting record writes already support stable idempotency keys. Some credit
  adjustments instead use generated correlation identifiers; replaying an MCP
  request must not duplicate an adjustment. The confirmed replay contract needs
  transactional implementation at that boundary.
- No MCP server or MCP SDK dependency exists in the current repository.

## Implementation preparation and verification

The approved scope requires the following implementation and verification work:

- Client setup: verify transport/authentication compatibility and configuration
  for Codex, Claude Code and OpenCode; provide in-admin instructions.
- Delegation enforcement: issuance validation for delegated change bounds and
  credit-adjustment ceilings; atomic enforcement and quota-period semantics.
- Provider checks: rate limits and accounting attribution to the invoking admin
  delegation, including uncertain upstream costs and in-flight work.
- Reporting: bounded query execution, snapshot freshness and attributable margin
  definitions under existing accounting rules.
- Mutation safety: replay retention and implementation of the confirmed
  version/idempotency contract.
- Transport/client compatibility, backend composition, port/startup, connection
  configuration, testing and failure diagnostics.

## Authority and dispatch implementation rules

Persist an explicit allowed-action snapshot at credential issuance. Group labels
are UI conveniences; adding a tool or broadening its input authority requires a
new immutable action identifier. Existing credentials cannot acquire it silently.
Operation keys are opaque UUIDs, and audit records store their digest rather than
caller prose. Reject credential-shaped material in audited reasons.

Paid dispatch linearizes at a short transaction that rechecks the active owner,
credential and frozen action, then records dispatch authorization. Revocation
blocks work that has not crossed this point; authorized work is cancelled where
supported. Shared operator counters and token ceilings are reserved atomically.
Unknown outcomes retain conservative token capacity and never mean zero expense.

Account purge revokes and scrubs credentials, erases MCP working/replay payloads
and redacts audit context while preserving pseudonymous financial references.
Incurred operator expenses remain settleable after private MCP records are erased.

## References

- [Proposed MCP boundary](adr/0047-delegated-local-admin-mcp.md)
- [Admin authorization](adr/0010-admin-application-and-authorization.md)
- [Accounting](adr/0045-action-accounting-and-provider-expenses.md)
- [Routing](adr/0046-admin-owned-text-ai-routing.md)
- [MCP HTTP transport security](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx)

The authentication protocol and supported MCP revision must be verified against
the selected client before implementation. A separate port is not authorization.
