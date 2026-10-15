# Review: Texts backend checkpoint

Status: Backend approved; frontend not yet implemented. Updated2026-10-15.

## Author preflight

Base `664198fee9eb1a0492134c43de9a9d04835568af`; original reviewed working-tree
snapshot [backend-preflight.sha256](backend-preflight.sha256). Final verified
backend snapshot [backend-verified.sha256](backend-verified.sha256).
[EVIDENCE.md](EVIDENCE.md) records tests, builds, real PostgreSQL/Redis and role proof.
No browser evidence claimed because the user explicitly deferred all UI work.

## Independent review

Both independent reviewers used GPT-6.1 Sol as requested. Initial full backend
scope included new/untracked files and changes to existing domains, contracts,
prompts, migrations, shared worker/capacity/credits, purge, HTTP composition,
restricted SQL roles, E2E runner and guide. They did not implement initial code.

- Correctness/architecture: [full report](review-correctness.md), independent
  reviewer `review_sol`; initial changes requested, then bounded remediation review
  approved after reproducing original defects and inspecting repaired paths/tests.
- Security: [full report](review-security.md), independent reviewer `security_sol`;
  initial full security audit plus targeted fix review. No remaining findings.
- Separate tester: `integration_sol` was required for the new guarded real-app
  runner, shared concurrency/retention and cross-domain journey assertions.
  It inspected guide semantics, tested real auth/Hono/PostgreSQL/Redis with only
  external AI replaced, and strengthened actual HTTP polling/security/CORS tests.
  Its assessment found no assertion gaps for the two mapped journey scenarios.
  Broader credit/lease/deletion races remain covered by focused real DB suites.

## Findings and remediation

| ID           | Severity | Problem and impact                                                                                                                                  | Remediation and closure                                                                                                                                                                                                   |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-01        | Medium   | New ADR reused existing0034, making architectural references ambiguous.                                                                             | New Texts ADR renumbered0035; index/references/relationship metadata fixed. Independent closure verified.                                                                                                                 |
| CR-02        | High     | Selection wildcard OPTIONS intercepted later routes, breaking browser PATCH/PUT/DELETE and shared header requests.                                  | All three new route modules limit middleware/preflight to owned paths; real composed-app tests exercise existing profile/dictionary and new methods/headers. Independent closure approved.                                |
| CR-03        | High     | Selection body/rate middleware applied to later modules; valid larger Texts input failed16KB limit and unrelated requests consumed selection quota. | Middleware scoped; regression accepts17k ASCII and20k Unicode codepoints and proves unrelated/preflight routes do not invoke selection limiter. Independent closure approved.                                             |
| SEC-TEXTS-01 | Medium   | Selection source version check preceded authority, leaking inaccessible foreign text existence/version through409 versus404.                        | Initial and retained-source resolution authorize first; stale/current unauthorized/wrong-key/revoked cases404 and authorized stale409. Text/folder capability DB regressions11/11; independent security closure approved. |

Reports contain original locations, reproduction scenarios, suggested fixes and
reviewed source hashes. No accepted open material findings or security exceptions.

## Final checkpoint decision

Backend AC-01–AC-08 verified. Source-grounded prompt/handoff AC-09 saved only after
backend approval. The overall feature remains active: AC-10 requires the returned
design, implementation and browser/E2E evidence. No merge, push, production rollout,
provider-network proof or visual-fidelity claim is included in this checkpoint.
