# Improvement: Development environment coverage and service URLs

Status: Complete
Created: 2026-09-24
Updated: 2026-09-24

## Routing decision

- Intended outcome: make supported local environment settings auditable and show the URLs of services currently started from the web development panel.
- Why this is an improvement rather than a correction: this is a focused developer-experience enhancement across the environment template, panel presentation, tests, and existing panel guide; it adds no product capability.
- Explicit-feature check: the user did not request a feature or full feature lifecycle.
- Feature boundaries checked: no new product capability or journey, public contract, persistence, security/auth policy, production dependency, deployment, migration, or ADR-worthy architecture decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit feature authorization before crossing any feature boundary.

## Context and scope

- Current behavior: `.env.example` is maintained manually, and the panel shows process state and logs without collecting active browser URLs in one place.
- Expected behavior: every supported local runtime/developer setting is represented in `.env.example`, while guarded test/CI internals remain outside it; the panel exposes a collapsed table whose rows track active URL-bearing commands.
- In scope: audit and, where needed, update `.env.example`; add reviewed service URL metadata, responsive panel rendering, regression coverage, and current guide text.
- Out of scope: production environment templates, arbitrary URL discovery, port reservation, health polling, and user-configurable service definitions.
- Likely files/surfaces: `.env.example`, `web-dev-panel/commands.json`, panel catalog/client/HTML/CSS/tests, and `docs/user-flows/web-dev-panel.md`.
- Relevant ADRs or constraints: ADR-0014 and the inherited ADR-0013 server-authoritative catalog/process boundary; dependency-free panel; render catalog data as text and permit only reviewed local HTTP URLs.
- Related user-flow guides: `docs/user-flows/web-dev-panel.md`.
- Rollback/removal path: remove endpoint metadata and its catalog/client rendering, then restore the prior guide revision; environment-template additions can be removed independently if their runtime consumers are retired.

## Acceptance criteria

- AC-1 — `.env.example` contains every supported root local runtime and developer configuration name, with secrets represented only by empty placeholders; test-only, CI-provided, shell-provided, and deployment-template variables are explicitly excluded from this coverage claim.
- AC-2 — The development panel has an accessible collapsed disclosure that updates from authoritative snapshots and lists each active URL-bearing service with its name, clickable local URL, process status, and originating command.
- AC-3 — Service URL metadata is schema-validated and constrained to reviewed loopback HTTP(S) URLs; inactive commands do not appear, duplicate URLs are not rendered twice, and the table has a clear empty state.
- AC-4 — The table remains usable at narrow and wide viewports, and automated plus real-browser verification covers disclosure, links, process-state updates, keyboard use, and console/request health.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Audit supported environment inputs and update the root template or record exclusions.
- [x] Add reviewed endpoint metadata and the collapsible running-service table.
- [x] Add or update the smallest reliable regression coverage.
- [x] Update and validate the existing user-flow guide and E2E traceability.
- [x] Run targeted checks and real-browser verification.
- [x] Inspect the final diff and record review results.

## Verification

| Check                    | Result                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tests                    | Pass — `pnpm test:web-dev-panel` (52/52); `pnpm test:e2e:web-dev-panel` (4/4, final patch)                                                                                                                   |
| Lint/typecheck/build     | Pass — targeted ESLint and `node --check` for changed JavaScript; targeted Prettier check; build/typecheck not applicable to this dependency-free JavaScript/HTML/CSS panel and environment-template change  |
| Runtime/browser/database | Pass — project-pinned `agent-browser` 0.33.0 against loopback fixture at desktop and 375×800; empty, running, keyboard disclosure, stop, links, responsive overflow, errors, console, and requests inspected |
| Documentation/user-flow  | Pass — `pnpm web-dev-panel:check`; `pnpm docs:user-flows:check`; `pnpm user-flow:e2e -- check web-dev-panel`                                                                                                 |

## Outcome and evidence

- Changes made: added missing supported settings to `.env.example`; added closed, loopback-only `serviceUrls` catalog metadata; rendered a collapsed live table for active panel-owned commands; added empty/default-port guidance, responsive styles, catalog tests, and browser journey coverage. Reconciled the already-added `test:e2e:ai-provider-management` root script into the reviewed panel catalog with a symmetric conflict against the overlapping admin E2E command.
- Environment audit: compared uppercase keys in the runtime Zod environment schemas plus root local runtime inputs against active or commented assignments in `.env.example`. The audit covered 102 required names against 133 documented names with zero missing. `DICTIONARY_AI_PROVIDER_FIXTURE_MODE` is intentionally excluded because worker validation permits it only under `APP_ENV=test`; CI/shell variables and the separate deployment templates remain outside the root local-template contract.
- Commands and results: `pnpm test:web-dev-panel` passed 52 tests; final `pnpm test:e2e:web-dev-panel` passed four Playwright journeys; targeted ESLint, syntax checks, formatting, catalog reconciliation, guide validation, traceability validation, and `git diff --check` passed.
- Browser evidence: task-scoped session `languon-dev-service-urls-04002afa5dbd7f4d01a7971e8fa04d28` on the synthetic loopback panel showed `0 available`, then three Running URL rows after Start whole app, keyboard-opened disclosure and clickable links, and returned to `0 available` after stop. At 375×800 the table stayed inside the disclosure with horizontal table scrolling and no page overflow. Browser errors and console were empty; requests were expected same-origin panel assets, SSE, and start mutations. Temporary screenshot: `/Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1790267664749.png`.
- Documentation: updated the panel README and current user-flow guide, including revised browser checks and E2E traceability.
- Review: initial review covered the full uncommitted improvement diff from `origin/main` plus both untracked work records. Finding `DEVURL-R1` (Medium) identified that a configurable backend port could make a static catalog URL look runtime-discovered. Resolved by labeling the column as a reviewed default and showing explicit guidance that overridden/dynamic URLs come from the ready log; the final E2E asserts this copy. Security boundary review found no open issue: catalog URLs accept only credential-free loopback HTTP(S) origins without query/fragment, values render through DOM text properties, and rejection tests cover remote, credential-bearing, and query-bearing URLs.

## Remaining risks

- Fixed URLs are reviewed defaults rather than readiness probes. A service may still be starting, and port overrides remain visible in the command ready log. Dynamic-port services such as the Mastra harness are intentionally omitted from the fixed-URL table.
