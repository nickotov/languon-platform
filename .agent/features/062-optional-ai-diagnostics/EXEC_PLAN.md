# ExecPlan: Optional AI diagnostics

## Goal and specification

Implement [FEATURE.md](FEATURE.md) under the authorized proposal. [EVIDENCE.md](EVIDENCE.md) owns checks; [REVIEW.md](REVIEW.md) owns independent findings.

## Existing architecture and consumers

Routing publication calls requireReady; admission, prepared admission and worker dispatch call the shared PostgreSQL languon_text_ai_route_dispatch_allowed predicate. That predicate currently requires a fingerprinted successful flow check and treats probe/runtime failures as exclusions until another successful check. Doctor mirrors that authority. All text consumers (conversation/interview, dictionary, text, sentence and knowledge) share it; speech is separate. Keep price/credential/worker/privacy/admission/settlement checks and immutable candidates intact.

## Test strategy

Before edits: root local read-only conversation doctor already reproduced mismatched-fingerprint block, all other prerequisites pass. No paid call made.

Focused development: node --test scripts/dev-readiness/*.test.mjs; targeted routing/probe/runtime-health DB suites and production execution regressions against owned disposable PostgreSQL/Redis. Estimate 2–8 minutes per focused DB selection after 1–3 minute dependency setup. Unit/doctor tests estimate <30 seconds. Static backend/admin typechecks, scoped ESLint/Prettier and backend/admin builds estimate 2–5 minutes.

Final risk gates: inspect pnpm test:e2e:critical -- --plan selections; common routing changes require ai-shared-invariants plus ai-conversation, ai-dictionary, ai-text and ai-sentence, and admin-text-ai-routing, setup-to-generation and ai-provider-management browser selections. The shared group additionally runs the mapped user-ai-model-preferences-backend journey. Estimate 10–25 minutes pending actual plan. No full unrelated speech/mobile gate. Existing test infrastructure is reused; no substantial harness is planned. Real DB proof is required because publication/admission/worker SQL all enforce the policy. Independent completion and security review required for SQL/admission/external-call effects. Runtime browser proof uses existing mapped Playwright journey and browser-verification skill. Live provider proof is separate and no paid diagnostic is necessary to implement this policy.

## User-flow documentation

Update admin-text-ai-routing and any existing affected setup/provider guides found by source mappings. Inspect exact registered mappings and preserve scenario IDs/revision acknowledgements. Update current routing design/cookbook/setup and affected agent delivery guidance that still mandates paid activation evidence. Supersede only ADR0046's verification-gating clauses via next unused cross-worktree ADR0056; preserve accepted historical decision bodies.

## Milestones

- [x] M1 — Backend/SQL policy and focused regressions (AC1–4).
- [x] M2 — Doctor/admin/docs/ADR synchronization and focused checks (AC2,5).
- [x] M3 — Author preflight, independent source/security review and remediation.
- [x] M4 — Final local DB/production/browser/static evidence approved (AC6); bounded build/release exceptions explicit.
- [x] M5 — Integrate source locally preserving feature061; verify production16/16, preference1/1, registry23/23 and doctor108PASS11INFO.
- [ ] M6 — Strict production qualification/declaration completion and eventual main squash; intentionally withheld, outside current local-delivery claim.

## Decisions

- D1: All environments use one policy; no bypass toggles or paid background rechecks.
- D2: Diagnostic records remain append-only operational/accounting history, with no admission authority.
- D3: Runtime cooldowns are bounded and self-recovering independently of diagnostic history; preserve provider-wide authentication, route-wide model/transient and flow/current-fingerprint schema scopes. Config/key changes may retain a genuine shared cooldown for at most60seconds; avoid new identity schemas and blind provider retries.
- D4: User's explicit proposal approval authorizes the ADR0046 policy supersession. No unrelated feature061 security disposition is accepted or merged.

## Progress and remaining work

2026-11-10: discovery and baseline reproduced. Isolated main-based worktree created. Dependency install offline lacked cached tarballs; reuse existing installed dependency tree via filesystem clone, without changing lockfile/dependencies. Next: implement bounded source slices and record focused evidence.

## Discoveries and preflight update

Doctor diagnostics can be removed from readiness without fingerprint construction at all; historical state is informational. Both doctor and the bounded smoke guard explicitly accept pass/info while rejecting blocked/unknown states. Paid diagnostic authorization is not expanded: former necessary-activation allowance is retired; bounded learner smoke policy remains.

Direct config validation on every routing publication initially broke the independent delegated tariff-only writer. Preserve old changed/newly-enabled route boundary while replacing only diagnostic evidence with actual credential/price checks. Admission remains unconditional. This is a supported-writer contract, not a fixture to seed away.

One new end-to-end runtime401 recovery test deliberately waits the real60-second product cooldown: privileged worker SQL uses clock_timestamp(), so application-only fake time cannot prove actual worker recovery. Keep the real clock/fences and one bounded61-second wait.

2026-11-10 source preflight: backend17/17remediation plus28valid unaffected focused tests, doctor/smoke48/48, admin16/16 and scoped static/build proof pass. Independent completion/source and security reviews started; final selected gates remain pending. Production11-case SDK/worker proof underway with the owned PG55565. Current guide mappings include admin routing, provider management and user preferences. No unrelated backlog tasks are implemented.

Independent source/security review F062-CR-01 identified an overly narrow all-fingerprint filter that let another flow or sibling provider route bypass known runtime failures. Accepted remediation restores reason-specific provider/route/flow scopes while retaining60-second automatic expiry. This replaces the initial all-identity-change-bypass assumption; no paid recheck or new persisted identity is introduced. Both reviewers agree the simpler preserved-scope policy is proportionate. Root will request focused remediation review after DB proof.

Release-classification discovery: main manifest was stale through0116; unrelated accumulated migrations contain transformation and old-overload retirement changes, while the deploy engine migrates before stopping the active slot. After independent review, keep marker/hash current through0165 and explicitly classify `contract` so production release intentionally fails closed pending a separately reviewed maintenance/staged plan and populated-data proof. No unrelated deployment implementation; local forward165 policy proof remains valid. Record technical implementation/local readiness separately from production-release readiness.

Local delivery decision: required production compatibility qualification intentionally remains blocked; do not claim strict feature/release completion or squash into main while it fails. Commit the reviewed source on this isolated feature branch and integrate that local source commit into the user's existing feature061 checkout to repair the requested development service without merging unrelated061 work/security disposition into main. Preserve both feature branches and record final local evidence separately. Remaining final gates continue against the isolated source, with conflict-specific integration proof on the original checkout.

Final local verification has finished. Reuse only exact validated case unions (shared249, sentence57), with raw failed aggregates retained. Both browser prerequisites are repaired and their real journeys pass. Original feature061production16cases, mapped preference and final typecheck pass; source hashes/proof manifests retained. Final independent evidence review is next. User-requested efficiency assessment is in EVIDENCE; no workflow/harness redesign added.

Final independent completion/security verdict: source and LOCAL delivery evidence approved, no remaining material finding or further local execution requested. EVIDENCE/REVIEW now report final reality without stale pending proof claims. Strict feature/production completion remains withheld at M6; no main merge/push. User-requested efficiency assessment is complete in EVIDENCE. Only record synchronization/local commits remain.
