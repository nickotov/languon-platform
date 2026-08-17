# Correction: Mastra Studio chat mutation rejection

Status: Complete
Created: 2026-08-17
Updated: 2026-08-17

## Routing decision

- Intended outcome: sending a message to the registered development verification
  agent in Mastra Studio reaches that agent instead of returning the harness's
  generic mutation-policy 403 response.
- Why this is a correction: this restores the already documented Studio agent
  journey at the existing local-only policy boundary; it adds no primitive,
  public contract, dependency, persistence, or deployment behavior.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: switch to feature development before continuing whenever any
  root correction condition becomes false.

## Context and scope

- Current behavior: Studio discovery loads, but sending chat returns a 403 saying
  only registered verification primitive mutations are permitted.
- Expected behavior: the exact generated Studio chat request for the registered
  agent is accepted, normalized by the existing execution policy, and dispatched.
- In scope: reproduce the request, narrowly correct route recognition, add a
  regression, and verify through the running Studio.
- Out of scope: allowing unrelated Mastra mutations, changing model/provider
  selection, or weakening prompt/model/tool/cost controls.
- Likely files/surfaces: `apps/backend/src/mastra/development-server-policy.ts`
  and its focused policy tests.
- Relevant ADRs or constraints: no matching accepted ADR; the local-only model
  execution trust boundary and root credential/logging constraints remain active.
- Related user-flow guides: `docs/user-flows/mastra-agent-development-harness.md`.

## Plan

- [x] Reproduce and capture the exact rejected Studio request.
- [x] Implement the bounded Studio transport correction.
- [x] Add the smallest reliable regression coverage.
- [x] Run targeted policy, type, lint, and browser validation.
- [x] Confirm documentation remains accurate and inspect the final diff.

## Verification

| Check                    | Result                 |
| ------------------------ | ---------------------- |
| Tests                    | 17 policy and 3 orchestration tests passed |
| Lint/typecheck/build     | Backend lint and typecheck passed; build not required |
| Runtime/browser/database | Real Studio chat passed; database verification not affected |
| Documentation/user-flow  | Guide mapping and all user-flow guides passed |

## Outcome and evidence

- Changes made: reproduced Studio's `POST .../threads/subscribe` request, then
  forced the pinned Studio client to disable unsupported thread signaling and
  use the existing secured `/stream` transport. The stream boundary accepts
  only Studio's exact UUID-thread/current-agent memory envelope and strips it
  before dispatch, while arbitrary memory and thread mutations remain blocked.
- Commands and results: focused policy test passed (17/17); orchestration test
  passed (3/3); backend typecheck and lint passed; `git diff --check` passed.
  A real browser at `http://localhost:4111` selected the documented synthetic
  request context, sent a fake message, observed one 200 agent `/stream` POST,
  no `/threads/subscribe` request, no page error, a successful verification-tool
  call, and the rendered `Principal resolved successfully` result.
- Documentation: updated developer and user-flow guidance for the intentionally
  disabled signal transport and restart troubleshooting; synchronized mapped
  revision `sha256:a1f70f95fb1b2930`. Both
  `pnpm user-flow:e2e -- check mastra-agent-development-harness` and
  `pnpm docs:user-flows:check` passed. The disposable database E2E was not
  rerun because neither its lifecycle behavior nor mapped scenario changed;
  the affected browser journey ran against the real generated server instead.
- Review: final diff preserves the exact registered execution allowlist,
  model/prompt/tool/cost controls, Host/Origin checks, and generic proxy block.
  The correction does not enable Mastra memory or signal mutations.

## Remaining risks

- None known. A running Studio page opened before the change should be reloaded;
  restarting `pnpm dev:mastra` is the documented fallback if its injected flag
  remains stale.
