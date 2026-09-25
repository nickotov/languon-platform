# Correction: Complete local AI environment configuration

Status: Complete
Created: 2026-09-25
Updated: 2026-09-25

## Routing decision

- Intended outcome: complete the ignored local environment settings needed to run the application and its live dictionary AI worker with the already configured DeepSeek and Kie credentials.
- Why this is a correction: it updates one developer's ignored local configuration using established keys and behavior, without changing product code, contracts, persistence, security policy, dependencies, or deployment.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md` remains true, including its behavior, contract, data, security, dependency, deployment, product-decision, coordination, and verification conditions.
- Escalation rule: continue as an improvement if its conditions hold; otherwise obtain feature authorization before expanded implementation. Mark this record `Escalated`, preserve discoveries, and link its successor.

## Context and scope

- Current behavior: `.env.local` already selects Mastra with DeepSeek, enables managed routing and the six card-authoring lifecycle settings, and contains nonempty DeepSeek and Kie text credentials, but it predates explicit worker database and operational settings added to `.env.example`.
- Expected behavior: local API and dictionary-worker configuration parses successfully with explicit safe development database, concurrency, polling, drain, and readiness values while preserving every existing credential and AI selection.
- In scope: ignored `.env.local` plus this correction record; non-network configuration validation.
- Out of scope: displaying or rotating credentials, making provider requests, changing admin routing data, enabling pronunciation TTS, or changing checked-in runtime behavior.
- Likely files/surfaces: `.env.local` (ignored) and this record.
- Relevant ADRs or constraints: credentials remain only in ignored environment files and may not appear in logs, diffs, tests, or durable records.
- Related user-flow guides: none; no command or observable product behavior changes.

## Acceptance criteria

- AC-1 — `.env.local` explicitly configures the local dictionary worker database and operational limits, retains Mastra/DeepSeek selection, managed routing, both provider credential capability flags, all six `card-authoring:v1` lifecycle settings, and nonempty DeepSeek/Kie credentials.
- AC-2 — Backend and dictionary-worker environment loaders accept the resulting configuration without making an external provider request or revealing secrets.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Add only missing safe local worker settings without replacing existing values.
- [x] Validate API and worker configuration locally without a generation request.
- [x] Confirm ignored/secret state and inspect the focused change.
- [x] Record evidence and mark complete.

## Verification

| Check                    | Result                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                    | Pass — backend and dictionary-worker environment loaders accepted the actual ignored local environment                                       |
| Lint/typecheck/build     | Not required — no checked-in source or build configuration changed                                                                           |
| Runtime/browser/database | Pass — dictionary worker healthcheck completed against the local database and DeepSeek `/models`; existing backend, web, and admin responded |
| Documentation/user-flow  | Not required — commands and observable behavior are unchanged                                                                                |

## Outcome and evidence

- Changes made: appended one explicit local worker block to ignored `.env.local`: `DATABASE_MAX_CONNECTIONS`, `DICTIONARY_WORKER_DATABASE_URL`, `DICTIONARY_WORKER_CONCURRENCY`, `DICTIONARY_WORKER_DRAIN_TIMEOUT_MS`, `DICTIONARY_WORKER_POLL_INTERVAL_MS`, and `DICTIONARY_WORKER_READINESS_TIMEOUT_MS`. Existing credentials, provider/model selection, routing flags, budgets, and lifecycle settings were not replaced.
- Commands and results: a secret-safe completeness check reported no missing required values, Mastra mode, `deepseek/deepseek-chat`, managed routing enabled, and both provider keys present. Direct API/audio/worker environment loading passed with concurrency 2, poll interval 1000 ms, readiness timeout 5000 ms, curated DeepSeek model recognition, a loaded provider credential, and `card-authoring:v1`. `pnpm --filter @languon/backend dictionary:worker:healthcheck` passed, covering the database and DeepSeek's authenticated non-generation `/models` readiness endpoint. Loopback checks returned healthy backend and web responses plus the admin HTML shell.
- Documentation: No guide change expected because commands and behavior are unchanged.
- Review: inspected the configuration operation for duplicate assignments and secret leakage. Each newly added key occurs exactly once, `.env.local` remains ignored by `.gitignore`, no secret value was printed or written to a tracked file, and the tracked diff remains limited to pre-existing work plus this secret-free correction record. A `pnpm dev:all` verification attempt reached application launch but correctly failed because an already-running admin process owned port 3001; that process and the other existing services were preserved rather than terminated.

## Remaining risks

- DeepSeek credential/readiness is verified without generating or billing text. Kie key presence is verified, but Kie's documented route-only HEAD readiness cannot prove credential validity or structured-output behavior; no Kie generation request was made.
