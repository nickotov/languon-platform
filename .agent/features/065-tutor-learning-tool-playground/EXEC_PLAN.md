# ExecPlan: Tutor and learning-tool playground

## Goal and specification

Implement [FEATURE.md](FEATURE.md), covering [BL-014](../../../docs/backlog/014-tutor-playground-done.md). Branch `feature/tutor-learning-tool-playground` from main f8e6a5a2. User will inspect playground before any exercise implementation.

## Existing architecture

Existing Studio entry only composes verification primitives; it has isolated PostgreSQL provisioning, canonical migrations, synthetic principal and guarded reset. Product tutor routing lives outside base Agent.stream; invoke canonical application worker/runner from workflow. Four content tools wrap shared authoring/publication and return receipts. Preserve source ownership and exact proposal readback. Read feature011, current harness guide, BL014/shared backlog constraints, ADR0052/55 and backend instructions.

## Decisions

- D1: Extend existing harness, not another service. Single-step workflow supports durable application sessions; global Mastra workflow/thread storage remains unnecessary.
- D2: Synthetic deterministic execution uses bounded production runner and real persistence, with external model replaced. It does not assert real financial settlement. Fresh operation-bound tools avoid singleton cancellation/publication state.
- D3: Intentional manual live testing requires explicit local server configuration, configured development credentials, a fixed model and normal per-operation bounds. This is distinct from agent-initiated paid verification, which remains governed by AI_SMOKE_POLICY. No live call is planned during automated verification.
- D4: Preserve current verification primitives and their policy. New routes require exact registered IDs and validated bodies; Studio context supplies selectors only.

## Test strategy

Baseline read-only `pnpm dev:doctor -- --capability knowledge-actions --phase configuration` passed (local sandbox network required escalation). Capture final same check. Focused new unit/policy/composition selections: seconds to 2 minutes. Backend typecheck/build/lint: approximately 2–5 minutes, root owns shared compilers. Existing `node scripts/run-mastra-playground-e2e.mjs` owns disposable Docker/PostgreSQL; estimated cold setup/body 1–3 minutes, tester owns case additions and root final execution. Real `pnpm dev:mastra` Studio browser proof required after reviewed startup; estimated 3–5 minutes. Validate mapped guide and docs. Broaden only for changed shared execution seams. Tests never use paid providers.

## User-flow documentation

Extend existing mastra-agent-development-harness guide and mapped journey, retain stable scenario IDs and synchronize revision markers through user-flow-e2e. Add developer usage reference once actual inputs/runtime verified.

## Milestones

- [x] M0 — Save and commit research/plan; baseline readiness and branch.
- [x] M1 — Canonical synthetic execution and persisted session/proposal adapter (AC2–4,6–7).
- [x] M2 — Registration/strict policy and focused proof (AC1,3,5–6).
- [x] M3 — Disposable persistence + Studio browser, docs and static checks (AC8–9).
- [x] M4 — Independent review/remediation/evidence approval and local squash integration.

## Ownership and progress

2026-11-12: root owns records, integration, expensive checks/browser and final handoff. playground_core owns new development-harness execution; playground_registry owns Mastra composition/policy/config; playground_verification owns disposable E2E cases and independent harness adequacy. No overlapping edits. Subsequent milestones below completed factory integration and persisted-run proof.

## Validation and remaining work

See [EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md). Runtime implementation, selected gates, documentation and independent completion/security evidence approvals complete. Local squash integration follows this final record update.

2026-11-12 preflight: canonical runtime/policy complete; initial review H1/H2/M3 and live accounting S1 remediated. Standard backend build including DTS, final runtime typecheck, 71 focused tests, startup checks, actual Studio vocabulary and same-session exercise follow-up pass. Test-driven configured live revealed host/injected credential mismatch; fixed explicit admission credential availability/fingerprint. The later final integration checkpoint below completes SDK/native-expense and recovery cases; no paid calls.

Final integration: reviewer-requested post-submit abort/failed claim and expired-A/exact-B recovery pass against disposable PostgreSQL. Configured live fixture exposed admission credential source mismatch; fixed to injected credentials+fingerprint. Final live SDK HTTP fixture proves durable expense settlement without paid calls. Frozen-patch static confirmation and independent evidence approvals subsequently passed. Standard backend build is reused: later changes confined to sandbox-internal availability policy and test fixtures; canonical production exports/claim code/declaration shape unchanged, new sandbox composition exercised by real Studio and SDK fixture, final typecheck checks the current graph.

Completion: final frozen-patch typecheck22003 and scoped ESLint pass. Independent reviewer and security reviewer approve source, remediation and final evidence; separate tester completes recovery and native-expense fixture proof. All acceptance criteria verified within documented limits. No exercise implementation started. User inspection is the next product step.
