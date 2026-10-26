# Correction: Text AI routing setup documentation

Status: Complete
Created: 2026-10-26
Updated: 2026-10-26

## Routing decision and scope

Documentation-only correction of established Feature054 behavior. No runtime,
contract, schema, security, billing or deployment-policy change. Work on current
branch; no automatic commit. Remove stale draft wording, align verification date
with retained passing final evidence, and document the actual optional environment
defaults and credential/restart boundary. No provider calls or admin publication.

User follow-up: add a detailed admin configuration cookbook with exact field
values, route examples, provider sources and troubleshooting. Documentation only;
no runtime/admin changes or live generation.

## Acceptance criteria

- AC-1: Routing/setup docs accurately describe implemented configuration and the
  already verified journey, without claiming live OpenRouter or EvoLink learner
  activation.

- AC-2: Provide reproducible existing-admin configuration steps and concrete
  examples, clearly distinguishing current sourced costs from proposed local
  test tariffs and unavailable activation.

## Plan

- [x] Compare docs with environment loaders, examples and retained feature evidence.
- [x] Correct docs and verify formatting, setup-profile consistency and E2E mapping.
- [x] Inspect scoped diff and record final result.

## Verification strategy

Reuse Feature054's passing final browser evidence: no executable journey or test
behavior changes. Run documentation/setup/traceability validators and Prettier.
No runtime/browser/database/security review needed for documentation-only edits;
no new paid checks. Independent review not required for this bounded factual fix.

## Outcome and evidence

AC-1 complete. Added copyable environment settings and exact fallback units,
validation/restart behavior, and explicit separation from admin publication.
Removed stale draft wording and aligned last_verified with Feature054's retained
2026-10-26 passing run b8c7d2cb-58b7-4c30-b238-0165ee291854. OpenRouter inference
key requirement and EvoLink processing gate remain explicit.

Reviewed the entire mapped browser test. Only its revision comment changed
(955b70054dcef38f → fc23199771f35cea); exact comparison confirms all executable
lines unchanged. Reuse of prior browser evidence is valid: no journey, runtime,
assertion, setup execution or application UI changed. No browser/provider rerun.

Verification passed: pnpm docs:user-flows:check (16 validator tests, 29 guides),
pnpm user-flow:e2e -- check admin-text-ai-routing, pnpm check:setup-docs, Prettier
and git diff --check. Author scoped review found no unrelated changes/secrets.
No independent review needed; no runtime/API/DB/security changes. Not committed.

## Remaining risks

OpenRouter needs an inference key; EvoLink learner processing remains gated.

## Detailed cookbook follow-up

AC-2 complete: docs/operations/admin-text-ai-routing-cookbook.md documents exact
current form labels, provider/model identities, concrete action/operator budgets,
three sourced OpenRouter price records, all11 paid-flow tariffs plus Free portrait,
all12 required default-route checks, Luna-only and Qwen/Gemini override examples,
credit/USD arithmetic, DeepSeek estimates, EvoLink check-only constraints, manual
learner verification and bounded recovery. Linked from the existing setup guide.

Official OpenRouter endpoint metadata and EvoLink model-page pricing were read
on2026-10-26 through public non-generation requests. Commercial rates remain
versioned observations; proposed100/500-credit tariffs are explicitly local test
choices. No provider credential, live generation, admin write or learner charge.

Read actual form components/translation labels, route-policy transformation,
publication guard, model limits, accounting contracts and current setup profiles.
Validated the three Markdown provider-price columns directly against
ProviderPricePublishRequestSchema; parsed all12 flow rows and validated both
routing configurations against TextAiRoutingPublishRequestSchema; arithmetic
checks pass. Command: node /tmp/verify-routing-cookbook.mjs (read-only, no network
or DB). Initial extractor runs encountered duplicate table row labels; scoped
them to the correct sections before final passing validation. These were parser
errors, not accepted configuration values. Structural validation does not replace
live matching flow checks or authorize production activation.

Final checks pass: docs:user-flows:check (16 tests/29 guides), check:setup-docs,
user-flow:e2e -- check admin-text-ai-routing, changed-file Prettier and diff check.
Author preflight complete; documentation-only scope reuses existing runtime
evidence without changing assertions. No new executable journey, runtime change,
paid call, browser test or independent review required. Not committed.
