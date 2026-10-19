# Tester review: architecture diagram viewer

Reviewed: 2026-10-19  
Reviewer: independent tester  
Scope: AC-4/AC-5 viewer harness, guide mapping and evidence only. No product source changed.

## Verdict

The focused HTTP/unit suite gives credible coverage of the catalog parser and
read-only loopback boundary. The maintained Chromium journey credibly covers
navigation and successful rendering for the real catalog when its freshness
precondition holds. Concurrent audio cleanup temporarily invalidated the
earlier all-current evidence; after reconciliation, V5 passed the primary
nine-diagram journey. The final content-hash manifest confirms its viewer,
guide and catalog inputs remain unchanged.

The remediation closes the two original browser-state gaps. A second maintained
scenario starts the real native server against an isolated temporary repository,
changes a recorded source to prove the visible stale warning, stamps only after
the synthetic input is reconciled, creates and repairs malformed Mermaid to
exercise rendering failure/source recovery, and stops/restarts that server to
prove visible fetch failure and retry. It also proves note HTML remains text and
records no page exceptions. No browser response or application layer is mocked.

## Evidence reviewed and current validity

| Check                                                                               | Result                                   | What it establishes                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:diagrams`                                                                | PASS, 4/4 (2026-10-19)                   | parser schema/directive rejection, source and diagram symlink confinement, explicit stamping/change detection, fixed assets/catalog, Host/Origin/cross-site rejection, unsupported method/path rejection, and no catalog-document mutation. The initial sandbox run could not bind `127.0.0.1` (`EPERM`); the permitted loopback rerun passed, so this is an environment limitation rather than a test failure. |
| `pnpm diagrams:check`                                                               | FAIL, expected during concurrent cleanup | Six of nine inputs need review: `ai-job-lifecycle`, `development-and-deployment`, `dictionaries-and-learning`, `module-boundaries`, `speech-and-pricing`, and `system-context`. Three remain current. This invalidates V3 and V2's all-current assertion for the final state until sources are reconciled and stamped.                                                                                          |
| `pnpm test:e2e:diagrams`                                                            | FAIL at freshness assertion              | Real Chromium started its owned `127.0.0.1:4412` server and rendered the first view, then correctly observed `#freshness[data-stale]="true"` where the success journey requires `"false"`. No implementation failure is demonstrated; the required final catalog reconciliation has not happened yet.                                                                                                           |
| `pnpm test:e2e:diagrams --grep 'show source drift'`                                 | PASS, 1/1 in 2.0s (2026-10-19)           | The remediation browser scenario proves stale status then reconciliation, real Mermaid render failure then source recovery, local-server fetch failure then retry, inert note HTML and no page exceptions. It uses an owned temporary repository/server and cleans both up.                                                                                                                                     |
| `DIAGRAM_EVIDENCE=true pnpm test:e2e:diagrams --grep 'browse every real diagram'`   | PASS, 1/1 in 3.4s (V5)                   | All nine reconciled real diagrams render in Chromium with current freshness, navigation, source inspection, search, zoom/fit, hash reload, keyboard and desktop/mobile layout checks; durable screenshots were captured. The final manifest confirms the viewer renderer/UI, primary test, guide and diagram catalog retain their tested bytes. |
| `pnpm diagrams:check`                                                                | PASS, 9/9 current (final comparison)     | Final catalog metadata, Mermaid syntax and source fingerprints are current. |
| `pnpm user-flow:e2e -- inspect/check development-cleanup-and-architecture-diagrams` | PASS                                     | The guide, mapped command, test file, scenario marker and revision marker are synchronized. It validates traceability only.                                                                                                                                                                                                                                                                                     |
| `pnpm docs:user-flows:check`                                                        | FAIL outside this viewer scope           | Its 16 checker tests pass, then existing shared-pronunciation/admin revision-marker inconsistencies fail repository validation. The new viewer guide did not cause the reported paths.                                                                                                                                                                                                                          |

The earlier V1/V2 run is historical only. V5 plus the independently rerun
failure-state scenario execute both mapped guide cases, and the final manifest
comparison and current 9/9 checker result keep that evidence valid. No viewer
test gap remains in this bounded review. No broader rerun is justified unless a
listed viewer, guide, catalog or relevant runtime dependency changes.

## Security/read-only assessment

The existing HTTP test is proportionate and meaningful for the local boundary:
it exercises malicious Host/Origin/cross-site headers, disallowed methods,
ordinary and encoded path attempts, source/document symlink escapes, Mermaid
directives/external-resource syntax, and fixed static/vendor assets. It does
not substitute for a security review, but no missing low-cost boundary test was
identified in this bounded tester review.
