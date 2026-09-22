# Verification evidence: Agent Browser Verification

Updated: 2026-08-14

## Automated tests

### Unit

- `pnpm test:agent-browser`: passed 8 deterministic wrapper tests covering the
  explicit config and security flags, local URL validation, unsafe command and
  option rejection, locator allowlisting, random wrapper-owned session markers,
  case-insensitive inherited environment removal, full doctor arguments, the
  documented install argument shape, and retryable cleanup ownership.

### Integration and runtime

- `pnpm browser:install`: passed with pnpm 10.13.1; managed Chrome for Testing
  152.0.7977.42 is installed in agent-browser's user cache.
- `pnpm browser:check`: passed 9 tests and the full offline doctor. The live
  regression opened a local page and proved that neither `sendBeacon` nor a
  clicked top-level navigation reached a listening, non-allowlisted IPv6 sink.
  Doctor reported CLI 0.33.0, managed Chrome, no active daemon, a valid config,
  and 8 pass / 0 warn / 0 fail including a headless `about:blank` launch.
- Public/service contract testing is not applicable; no application contract
  changed.

### E2E

- No Playwright test was changed or used for exploratory inspection.
  `apps/web` retains `@playwright/test` 1.62.1 and its `test:e2e` command as the
  durable E2E layer. Independent testing listed the three existing Playwright
  journeys successfully; executing them is not applicable because this feature
  changes internal tooling rather than product behavior.

## Real application verification

- Tool/environment: agent-browser 0.33.0 with managed headless Chrome on macOS
  arm64; local Next.js app at `http://127.0.0.1:3333`.
- Session: wrapper-generated
  `languon-feature-smoke-b4a360ede1f00838262a020b75457576`, closed after the
  smoke; its ownership marker was removed by the wrapper.
- Viewport: 390x844.
- Workflow: `pnpm browser -- start feature-smoke http://127.0.0.1:3333`, then
  the returned handle for viewport, interactive snapshot, errors, console,
  network inspection, and close.
- Result: the page loaded with heading `Languon`, Account navigation, and Sign
  in link. No page errors were reported. Console contained only the React
  development notice and HMR connection. The document and local assets returned 200. Requests to the intentionally absent local backend had no response and
  did not affect the browser-tool smoke.
- Safeguards observed: output used nonce-bearing content boundaries; browser
  traffic was host-allowlisted; normal commands used a random wrapper-owned
  session; the environment and dangerous command surface were filtered.

## Tooling and configuration

- `pnpm exec agent-browser --version`: `agent-browser 0.33.0`.
- `pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts`:
  passed with pnpm 10.13.1.
- Upstream package metadata declares pnpm 11. This is retained as a documented
  metadata mismatch because 0.27.0 failed the live security regression, while
  the complete consumer/install/runtime path above passes under the repository's
  pinned pnpm 10 toolchain.
- `git diff --check`: passed before the final full check.

## Static and repository checks

- `pnpm check`: passed after the final wrapper, documentation, and containment
  changes.
- Format and user-flow docs checks passed; 15 guide checker tests passed and one
  current guide/E2E mapping validated.
- Lint, typecheck, and build passed across all seven workspaces and root scripts.
- Tests: 222 passed (8 wrapper plus 214 existing); 34 existing
  environment-dependent integration tests were skipped; no failures.

## User-flow and database verification

- No guide was created or updated: this feature changes internal agent tooling,
  not an executable Languon product journey. No source mapping, scenario marker,
  or product behavior changed.
- Database verification is not applicable: no database, migration, query,
  Redis, or persistence change.

## Review

- Initial independent and security reviews found a quick doctor gap, stale MCP
  language, inherited config/environment risk, unsafe command exposure, pnpm
  metadata mismatch, ineffective 0.27.0 network containment, and predictable
  session adoption. The implementation now uses a full doctor, CLI-only wording,
  a filtered safe wrapper, 0.33.0 with an executable containment regression, and
  random wrapper-owned session handles.
- Final independent implementation review: clean; no Critical, High, Medium, or
  other material findings remain.
- Final independent tester: clean; reran 9/9 browser checks under hostile
  inherited browser/proxy environment values, full doctor, frozen pnpm 10
  lockfile validation, Playwright discovery, and documentation checks.
- Final security review: clean; no material finding remains. The documented
  residual risks are accurate and acceptable for this local workflow.

## Remaining risks

- The allowlist is browser-level host containment, not an OS firewall or
  port-level origin boundary. Any service on an allowed local host can be
  reachable; agents must run reviewed services and use fake data.
- Session handles isolate routine agent work but are not a security boundary
  between malicious same-user host processes. Crash-stale markers and browser
  artifacts require review and cleanup.
- `agent-browser` and managed Chrome are native supply-chain components. The npm
  package is integrity-pinned; `browser:install` remains an explicit external
  runtime download.
- The supplied ChatGPT share URL was not retrievable in this environment;
  upstream GitHub/npm documentation, installed help, and live behavior were used.
