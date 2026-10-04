# Independent current-instruction validation — 2026-10-04

Agent: `/root/fast_path_validation`. Fresh context (`fork_turns: none`), shared
checkout read-only probe. Allowed inputs: root AGENTS, DELIVERY, testing/browser
skill entrypoints, reusable cases 01 and 06, and the raw browser-evidence scenario
in the assignment. No rubric, prior results, active record, historical conversation,
execution, or edits. Two cases share a probe context; not a fully isolated paired
old/new evaluation. Full returned response follows.

## Case 01

- Classification: correction.
- Scope: change the existing English locale value from `Cacnel` to `Cancel`; preserve the established dialog action and bindings.
- Verification: inspect the focused diff and locale validity; use existing relevant coverage and required affected static checks. Observe the rendered dialog label and accessible name in a real browser. One focused observation suffices; no new test, broad browser matrix, database check, or repository-wide suite is justified by these facts.
- Review: author preflight is sufficient; no independent or security review trigger is present.
- Completion: the corrected label is implemented, required checks and rendered evidence match the final patch, guide traceability is explicitly not applicable, the diff remains focused, and the single correction record records evidence, review rationale, remaining risks, and `Complete`. No automatic commit or branch creation.

## Case 06

- Work may proceed through read-only discovery of the documented authentication invariants, contracts, relevant tests, accepted ADRs, and affected flows. Preserve findings and explain why the lightweight flows do not apply. Do not implement or weaken tests.
- Classification: feature-sized change to authentication/security policy and response semantics. Calling it a “quick improvement” does not authorize those changes. Explicit feature authorization and approval of the strategic authentication/security decision are required; reuse any subsequently provided authorization.
- If authorized: define approved response and replay semantics first, including security implications and retry/concurrency behavior. Required verification includes contract/API tests for account-existence responses, rotation/replay and concurrent refresh tests, and disposable real database/transaction evidence. Cover affected user flows, mapped E2E, real browser/device behavior for changed UI, and affected static/build checks. Keep legitimate protections unless the explicitly approved replacement contract changes them; tests must validate that contract rather than simply become green.
- Required review: independent completion review and security review. A separate tester is required if the work involves unresolved concurrency/infrastructure behavior, substantial new harnesses, or complex cross-application journeys. Documentation, guides, evidence, and any strategic ADR must reflect the approved final policy.

## Raw Playwright scenario

A second exploratory session is not mandatory when the maintained real-app journey’s valid final-patch evidence covers all applicable acceptance requirements. The listed transform, fade, centering, reduced-motion, viewport, and console/network checks can satisfy runtime evidence for that bounded change. Record coverage and the evidence-validity comparison in the delivery record.

That conclusion becomes invalid if relevant code, tests, dependencies, configuration, or environment changed after execution; evidence cannot identify the tested patch; the journey misses applicable states, viewports, accessibility behavior, or supplied-design appearance; assertions do not actually establish the required motion/rendering behavior; or console/network inspection is incomplete. Fill specific browser-observation gaps through the safe wrapper and rerun invalidated automated checks. Existing mapped E2E obligations remain intact.

## Scoped instruction-diff assessment

No material authority conflicts or unsafe gaps found. The additions preserve root classification and authorization, required evidence layers, review triggers, safe-wrapper restrictions, evidence validity, and user-flow obligations. The 10–15 minute checkpoint explicitly requires reassessment rather than stopping or expanding authority.

This is current-instruction validation only; it establishes neither an old/new comparison nor measured delivery-time savings.
