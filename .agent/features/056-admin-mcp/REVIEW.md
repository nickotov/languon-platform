# Review: Delegated local admin MCP

Status: Complete; no material findings remain.
Boundary: main7667925 plus the complete tracked/untracked feature056 patch.

## Review procedure

Author preflight mapped acceptance to unit, disposable PostgreSQL, browser and
actual-client evidence. Independent completion and security reviewers inspected
implementation and coverage; a separate tester audited the new orchestration
harness and added targeted regressions. Reviews did not replace execution.

Initial completion snapshot: tracked diff SHA256
4c05343e1bea1115f491bb7064a849d04afe8f1dbec9e833ac791bfad47b48a5;
untracked manifest52306a08ff805b0d0300530fbb1a0c4ee927cdacc41860a4a85c5af7a6c60eb2.
Subsequent remediation reviews covered changed surfaces and affected invariants.

## Security findings

| ID          | Severity | Problem                                               | Disposition                                                                                                                       |
| ----------- | -------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SEC-MCP-001 | High     | Broad groups could expand old token authority         | Closed: persisted frozen allowedActions, deny-by-default migration and runtime/transaction enforcement                            |
| SEC-MCP-002 | Medium   | Caller keys/reasons could retain credentials in audit | Closed: UUID keys, key digests, credential rejection/redaction and safe audit context                                             |
| SEC-MCP-003 | Medium   | Account purge omitted new private MCP data            | Closed: fenced purge participant erases payloads, scrubs/revokes credentials and preserves opaque expense references              |
| SEC-MCP-004 | Medium   | Failed/missing-context audit outcomes                 | Closed: safe post-rollback read/write/check rejection auditing, bounded before/proposed scalars and token-owned preview lookup    |
| SEC-MCP-005 | Medium   | Reauthentication did not fence paid dispatch          | Closed: durable single-use dispatch authorization, atomic shared operator/token budgets, revocation-aware cancellation/settlement |

Security remediation verdict: no material findings remain. Application-seam and
local-only production gating changes were included in the final review.

## Completion findings

| ID          | Severity | Problem                                                           | Disposition                                                                                                            |
| ----------- | -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| REV-MCP-001 | Medium   | Lower token check ceilings unusable                               | Closed: strictest effective cap reaches actual probe reservation/executor                                              |
| REV-MCP-002 | Medium   | Default financial reports omitted today                           | Closed: stable thirty UTC calendar days including partial current day                                                  |
| REV-MCP-003 | Medium   | Generated Next declaration leaked; overlapping restorations raced | Closed: canonical restoration and shared atomic preservation lock; contention/failure tests                            |
| REV-MCP-004 | Medium   | Stale state/missing checks returned generic errors                | Closed: actionable stale_preview/check_required mappings, no implicit checks                                           |
| REV-MCP-005 | Medium   | Paid check audit lacked expense reference                         | Closed: authoritative providerExpenseId lookup retained in audit                                                       |
| REV-MCP-006 | Low      | Unused MCP runtime packages                                       | Closed: removed client/node packages with pnpm; server SDK remains                                                     |
| REV-MCP-007 | Medium   | Browser token issuance exposed in production                      | Closed: dev/test-only backend routes, production-hidden admin capability and loopback DB enforcement                   |
| REV-MCP-008 | High     | Sensitive reads/previews were not audited                         | Closed: application-owned success/rejection audits and real SDK/PG proof                                               |
| REV-MCP-009 | High     | Inspection/preview implicitly initialized billing revisions       | Closed: pure published-state reads; initial publication happens only on Apply                                          |
| REV-MCP-010 | Medium   | Clients could not discover approved check maximum                 | Closed: read-only status/inspection disclose effective limits and reset time                                           |
| REV-MCP-011 | Medium   | Copied guides ignored custom listener port                        | Closed: validated editable port regenerates all three client configurations; browser proof at3999                      |
| REV-MCP-012 | Medium   | Lock waits could outlive preview expiry                           | Closed: fresh pre-mutation/pre-commit expiry checks and rollback/lock-wait regressions                                 |
| REV-MCP-013 | Medium   | Transport depended directly on Drizzle orchestration              | Closed: application administration/check services and typed ports; persistence adapters and interface SDK registration |

Independent focused remediation verdict: no material findings remain. The reviewer
confirmed transaction, authorization, replay, audit, cancellation and shared-file
preservation invariants. No accepted/deferred material finding remains.

## Final verification

Final critical gate passed all 13 journeys (420 backend checks and 22 browser
tests). Affected static/build/docs checks and real PostgreSQL/browser/client
proof passed. The generated declaration was restored byte-for-byte and its
preservation lock released. Final source manifest and retained limitations are
recorded in [EVIDENCE.md](EVIDENCE.md). No material finding is deferred.
