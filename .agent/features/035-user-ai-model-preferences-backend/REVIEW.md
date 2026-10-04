# Review: User AI model preferences backend

Updated: 2026-10-04

## Author preflight

Passed. See [EVIDENCE.md](EVIDENCE.md) and
[reviewed source manifest](author-preflight-manifest.json). Current feature branch
includes tracked and untracked implementation files; review covers both.

## Independent completion review

Initial verdict: changes requested from independent
`preferences_completion_review` against the exact preflight source digest. No
other material correctness, architecture, authorization, redaction or purge issue
was found. Both findings below are being remediated before a scoped follow-up
review.

## Separate tester

Independent `preference_journey_verification` implemented and executed the
real authenticated API/PostgreSQL/Redis deterministic worker journey (1/1 passed),
then diagnosed and verified existing provider/credit Chromium regressions (both
1/1 passed). Real SQL guard and restricted-role purge checks also passed.

## Security review

Pass, no material security findings, independently reported by
`preferences_security_review` against the 69-file preflight digest. Verified active
bearer identity, transactional user validation/versioning, sanitized catalog,
trusted server-curated immutable snapshots, fixed adapter URLs, old-worker SQL
fences, and least-privilege preference purge.

Residual assumptions: capability markers protect compatibility rather than a
compromised worker credential; deployment isolates purge credentials. Providers
were deterministic; Kie's existing bounded HEAD readiness remains intentionally
unverified for paid completion. Deployment-level request throttling remains an
operational defense-in-depth assumption. No new public provider URLs, model tool
execution or logging of private content were introduced.

## Findings and remediation

| ID           | Severity | Location / problem                                                                                  | Impact                                                                                    | Remediation / status                                                                                                                                                                                                                                                         |
| ------------ | -------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F035-REV-001 | High     | Worker observation publisher reuses legacy identity; legacy upsert leaves selection revision behind | Rolled-back incapable worker appears capable, admitting unclaimable jobs and reservations | Versioned identities with exact-capability matcher implemented; real legacy-upsert regression passed. Actual runtime format list and wrong-format regression also added; all focused checks passed; awaiting scoped follow-up review.                                        |
| F035-REV-002 | Medium   | Dictionary provider circuits are keyed by format rather than pinned provider/model                  | One model's failures block healthy models; another model's success clears failed circuit  | Scoped provider/model/format circuit keys implemented, including claim filtering before LIMIT; historical format-only keys retained for unmanaged work. Two-model and SQL guard integration checks 2/2 passed; routing units 37/37 passed; awaiting scoped follow-up review. |

Locations: observation publisher and shared admission policy for REV-001;
dictionary persistence schema/store circuit lifecycle for REV-002. Author preflight
must be refreshed after fixes; original manifest remains initial-review evidence.

Author-discovered adjacent gap: explicit admission also needs exact requested
worker-format evidence. Migration 0044 adds nullable bounded observation format
lists and expands circuit IDs. Old worker fields remain compatible; new explicit
readiness is fail-closed. A wrong-format capability regression covers this path.

## Final verdict

Pass. Independent completion remediation review and scoped security review both
passed against digest
`6a4c7e9e9f6aadd8d9d03f826811e8bbf4f4a314c856cf58dc1f1ee0b52da67c`.
F035-REV-001 and F035-REV-002 are resolved; exact-format readiness is verified.
No new material correctness, architecture, persistence, rollout, test-coverage or
security finding remains. No deferred frontend or live paid-provider claim is made.
