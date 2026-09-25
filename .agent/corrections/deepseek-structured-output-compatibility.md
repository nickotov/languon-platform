# Correction: DeepSeek structured-output compatibility

Status: Complete
Created: 2026-09-25
Updated: 2026-09-25

## Routing decision

- Intended outcome: dictionary card authoring succeeds with the curated DeepSeek model instead of exhausting retries after DeepSeek rejects an unsupported native JSON Schema response format.
- Why this is a correction: this repairs the established curated DeepSeek adapter contract without changing a public API, persisted data, authorization, product policy, dependency, deployment topology, or user journey.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md` remains true, including its behavior, contract, data, security, dependency, deployment, product-decision, coordination, and verification conditions.
- Escalation rule: continue as an improvement if its conditions hold; otherwise obtain feature authorization before expanded implementation. Mark this record `Escalated`, preserve discoveries, and link its successor.

## Context and scope

- Current behavior: job `f7069947-7600-4528-8670-9cca738e233a` made three attempts and failed as `provider_unavailable`. A sanitized live request established that DeepSeek returns HTTP 400 for `response_format.type=json_schema` with `This response_format type is unavailable now`.
- Expected behavior: the DeepSeek catalog adapter asks Mastra to inject the JSON schema into the prompt, omits unsupported native `response_format`, and continues to parse and validate the returned object against the same local Zod schema. Providers that support native JSON Schema retain their current wire contract.
- In scope: provider capability metadata; propagation into all dictionary text generation adapters; wire-contract and focused unit coverage; a sanitized live DeepSeek compatibility check.
- Out of scope: changing retry policy generally, creating an admin provider configuration, enabling credit enforcement, changing user budgets, or modifying frontend error copy.
- Likely files/surfaces: dictionary text provider catalog/router; four Mastra proposal generators; worker composition; infrastructure adapter tests.
- Relevant ADRs or constraints: ADR-0021 requires per-model contract evidence and notes that OpenAI compatibility does not imply JSON Schema support. External model output remains untrusted and locally validated; prompts and credentials must not be logged.
- Related user-flow guides: `docs/user-flows/ai-provider-management.md` and `docs/user-flows/ai-credit-wallet.md`; their observable contracts do not change because successful curated-provider generation is already the documented behavior.

## Acceptance criteria

- AC-1 — DeepSeek dictionary generation omits native `response_format`, uses Mastra inline JSON prompt injection, and validates the resulting object with the existing schema.
- AC-2 — Kie retains the native JSON Schema wire contract.
- AC-3 — The capability selection applies consistently to card authoring, single-card generation, pasted terms, and import pairs in both legacy environment and managed provider routing.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Implement the bounded change.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation or record why none is needed.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                 |
| ------------------------ | ---------------------- |
| Tests                    | Pass: backend 597 passed, 158 skipped |
| Lint/typecheck/build     | Pass: backend lint, typecheck, and build |
| Runtime/browser/database | Pass: sanitized live DeepSeek card-authoring request; browser/database not required for the final backend-only patch |
| Documentation/user-flow  | Pass: all guide validation plus provider-management and credit-wallet mapping checks |

## Outcome and evidence

- Changes made: the curated text-model catalog now distinguishes native JSON Schema from prompt-injected structured output. DeepSeek selects Mastra inline schema injection; Kie retains native JSON Schema. A single catalog-to-generator options helper is shared by legacy worker and managed routing, and all four proposal generators apply the selected mode while retaining their existing Zod/domain validation.
- Commands and results:
  - Root-cause evidence: the exact failed job completed after three attempts with `provider_unavailable`; a sanitized direct DeepSeek probe returned HTTP 400 and `This response_format type is unavailable now` for `response_format.type=json_schema`.
  - `pnpm --filter @languon/backend exec vitest run` with the seven affected catalog/router/generator/wire test files — pass, 42 tests.
  - `pnpm --filter @languon/backend test` — pass, 86 files / 597 tests; 21 files / 158 tests skipped by their existing conditions.
  - `pnpm --filter @languon/backend lint` — pass.
  - `pnpm --filter @languon/backend typecheck` — pass.
  - `pnpm --filter @languon/backend build` — pass.
  - One sanitized live request through the final Mastra/card-authoring/catalog-helper path using `alarmer` — pass in about four seconds; one validated suggestion, 414 input tokens and 18 output tokens. The temporary smoke script was removed and neither the credential nor generated text was printed.
  - `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check ai-provider-management`, and `pnpm user-flow:e2e -- check ai-credit-wallet` — pass.
  - `git diff --check` — pass. Final runtime/test patch SHA-256: `05b9bf12da16b3c48fa567978aa1ad7dc87949ff92a3cc8d94dc7038a76f28ba`, based on `ed211ed7e16cd635b66b3d76dfcc5a67611d6132`.
- Documentation: no guide prose changed. Successful curated-provider generation is already the documented journey; the correction only restores that contract. Traceability remains valid.
- Review: initial independent review found DSOR-REV-001 (medium), insufficient propagation coverage. Remediation centralized catalog mapping across legacy and managed routes and added coverage for all four generators; focused remediation review marked it resolved with no new findings. Focused security review found no material issues: fixed catalog URLs, hidden tracing, disabled tools, bounded requests, and local strict validation remain intact.

## Remaining risks

- DeepSeek remains an external nondeterministic service; the live check establishes current protocol compatibility but cannot guarantee future availability or suggestion quality. Prompt injection may affect text quality within the allowed schema, but generated values remain strictly validated and review-only.
