# ExecPlan: Delegated local admin MCP

Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-27

## Goal and specification

Deliver AC-1–AC-10 under the confirmed23-decision design. User authorized implementation.
Branch feature/admin-mcp from main7667925; preserve design changes already in workspace.

## Existing architecture

Admin service verifies browser identity/membership; sensitive browser writes require recentauth.
Ledger/routing transaction participants are reusable; some HTTP orchestration needs extraction.
No MCP SDK currently present. ADR0010,0045,0046 constrain auth/accounting/routing.
ADR0047 approved by consolidated user confirmation; record acceptance when finalizing.

## Test and review strategy

Unit/contract: schemas, permissions, token expiry, Host/Origin, protocol errors.
Disposable PostgreSQL: migration, tokens/owner revocation, atomic replay/previews, concurrent
quotas and financial invariants. Backend HTTP/client: actual SDK transport and auth.
Browser: existing admin Playwright fixture expanded for token lifecycle, mobile/desktop,
console/network errors. Full critical gate required (shared auth/accounting/model paths).
No paid/nondeterministic tests. Actual three-client connections required; establish installed
client availability and report exact evidence rather than substituting protocol-only proof.
Independent completion reviewer and security reviewer after author preflight required.
Separate tester required: new cross-application MCP harness and concurrency boundary.

## User-flow documentation

Create admin-mcp guide + mapped tests; existing admin-user-management mapping examined
before modifications. Exact command/scenario selection to be established during harness work.

## Milestones

- [x] M1 — Credential/security persistence and contracts (AC-2,3,4,8).
- [x] M2 — Administrative tool operations and transport/composition (AC-1,4,5,6,7).
- [x] M3 — Admin management and verified client guides (AC-2,8,9).
- [x] M4 — Disposable/full-stack/critical verification and docs (AC-1–10).
- [x] M5 — Author preflight, independent reviews, remediation and squash merge.

## Current progress

2026-10-27: All acceptance criteria implemented. Final critical gate passed all
13 journeys (420 backend checks and 22 browser tests). Final affected typechecks,
builds, lint, formatting, documentation mappings and disposable database checks
passed. All three actual clients connected. Independent correctness and security
reviews report no material findings. Generated Next declaration restored exactly;
shared preservation lock released. Local feature commit and squash integration
are the final Git delivery action; no push or branch deletion is authorized.

## Decisions and discoveries

D1: Local opt-in backend process, port3002, no distributed infrastructure.
D2: Persist frozen action IDs, not just group labels. Broader authority needs a new ID.
D3: Application administration/check services coordinate ports; adapters own SQL and
existing atomic participants. Interface contains MCP SDK registration only.
D4: Snapshot default is thirty UTC calendar days including partial current day,
with stable range keys and explicit freshness/partial-day note.
D5: Legacy tariff readers seed missing revisions. MCP inspection/preview uses pure
published-state queries; initial creation is an explicit Apply only.
D6: Shared generated-file preservation is locked before snapshot. Direct simultaneous
browser runners are unsupported; canonical commands use the shared guarded helper.
D7: Reviews exposed gaps missed by isolated initial tests (legacy lazy writes,
strictest-cap propagation, lock-wait expiry and boundary placement). Regressions now
exercise actual application/PG paths; no accepted material finding remains.
D8: Backlog index inspected; no matching backlog task applies to this new feature.

## Validation links

Acceptance/proof and exact checks: EVIDENCE.md. Review dispositions: REVIEW.md.

## Completion and limitations

Implementation, review and verification complete. No paid provider calls or normal
development database writes performed. Start the optional listener with
`pnpm dev:admin-mcp` after normal application migrations. Production access remains
explicitly disabled. Remote deployment and distributed infrastructure are outside
this delivery.
