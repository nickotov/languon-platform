# Review: Optional AI diagnostics

Status: Pending

## Boundary and mode

Initial independent completion review after focused author preflight: main89ff4193 plus complete scoped tracked/untracked diff. Independent security review covers database admission/publication, runtime recovery and preserved financial/privacy/operator authorization. Final evidence approval follows selected gates.

## Findings and disposition

Pending.

## Initial findings

- F062-CR-01 / security matching finding — Medium, material. The first revised SQL predicate scoped all runtime failures to a full flow fingerprint, allowing sibling flow/provider candidates to bypass known authentication/outage failures. Accepted: restore provider-wide auth, route-wide model/transient, flow/current-fingerprint schema scope with60-second expiry; no new identity schema needed. Add cross-flow/cross-route/unrelated-provider/auto-recovery regressions. Remediation source/DB proof pending. Diagnostic independence and automatic recovery remain acceptance requirements.

- F062-CR-01 and F062-SR-01 resolved: reason-scoped runtime policy inspected independently; fresh-migration DB18/18passed0skips (`/private/tmp/languon-optional-policy-runtime-scope.json`). Security source phase approves final gates, no open material security finding.
- F062-CR-02 — Medium, material: existing dev setup CLI still told operators successful route/flow checks were required; catalog comment repeated it. Corrected CLI and comment; enhanced existing configure preview/apply test to assert optional/no-route-authority guidance. Setup10/10pass, lint/format/diff pass; scoped current-source mandatory-check search has no matches. Focused review confirmation pending.

Release metadata disposition: independent completion review rejected restoring stale0116 or advancing migrate without accumulated compatibility proof. Adopted current0165/hash plus explicit `contract` blocking classification and rationale. This honestly prevents production blue/green release until separate accumulated migration/deployer qualification; no production release is claimed by technical implementation/local proof.
