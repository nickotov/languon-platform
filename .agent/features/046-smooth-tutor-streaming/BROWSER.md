# Deterministic streaming browser verification

## Scope and preparation

Base e83bc49; feature046 in progress. Applies testing, browser-verification,
user-flow-e2e and db-verification skills. The maintained contextual runner remains
the only execution entrypoint. No ordinary developer database or cache is used.

The existing source-chat-save-knowledge test now opts its external provider into
900ms first-text delay, four-character deltas every140ms and a1100ms mid-response
pause. Mastra/tool execution, auth, worker, PostgreSQL persistence, accounting,
SSE, AI SDK and rendered UI remain real. Existing three journeys and one shared
reader retain the existing five-account signup limit including fixture seeding.
No extra browser test or signup is added.

A MutationObserver records actual displayed text and activity states, rather
than substituting network chunks or React internal state. Assertions cover empty
placeholder activity, pause activity, at least10 prefix-preserving text changes
of at most20characters, at least8 sub800ms intervals, exact final output and
activity cleanup. Existing mobile scenario retains close/reopen without duplicate
admission, explicit Stop, incomplete response, provider failure, accounting and
explicit retry; adds activity removal after Stop. Screenshots capture first-text
waiting and midstream pause; existing runtime error/network guards remain.

The exact mapped runner is `pnpm test:e2e:contextual-assistant` with the explicit
confirmed disposable PostgreSQL55444/languon_auth_assistant_web_test and
Redis56444/1 environment documented in the guide. The full run below followed the production-stability signal; no service was
launched during test preparation.

## Preparation checks

- `pnpm exec eslint apps/backend/tests/support/contextual-assistant-fixture.ts apps/web/tests/e2e/contextual-assistant.journeys.spec.ts` — pass.
- `pnpm user-flow:e2e -- check contextual-language-assistant-and-knowledge` — pass;
  guide revision sha256:240dbc828db2e728, mapped backend marker synchronized after
  full-file review, backend test logic unchanged.

## Execution

2026-10-19: production stable signal received; executed full registered runner:

```sh
ALLOW_DISPOSABLE_DATABASE_TESTS=true ALLOW_DISPOSABLE_REDIS_TESTS=true AUTH_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55444/languon_auth_assistant_web_test AUTH_TEST_DATABASE_CONFIRM=languon_auth_assistant_web_test AUTH_TEST_REDIS_URL=redis://127.0.0.1:56444/1 AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56444/1 AUTH_E2E_RUN_ID=stream046-final pnpm test:e2e:contextual-assistant
```

Result: exit0, composed HTTP2/2 (4.50s), Chromium browser3/3 (50.6s):
source/private-note14.4s, dictionary/sharing11.5s, mobile durable lifecycle18.9s.
The new rendered timing, waiting, pause and cleanup assertions passed on first
execution. No page errors, unexpected failed requests, compressed SSE or500s.
Expected fixture stop/abort messages are induced by the explicit Stop scenario.
Maintained screenshots show attached desktop Working before first text and during
pause; mobile final prose, actions and composer fit390px. Existing scenario also
checks320px overflow and reduced-motion/dark RTL rendering. Manually inspected
retained desktop waiting/pause and mobile completion images; no visual defect.

Containers created exclusively for this run: languon-stream046-postgres
(postgres:17-alpine, loopback55444) and languon-stream046-redis (redis:7-alpine,
loopback56444/1); both removed after success. Runner stopped owned servers and
restored tracked next-env.d.ts. Ordinary developer services/data untouched.

Retained synthetic screenshots: evidence/tutor-working-before-first-text-desktop.png,
evidence/tutor-working-during-provider-pause-desktop.png,
evidence/assistant-reconnected-mobile.png,
evidence/tutor-dark-rtl-material-reduced-motion.png. Raw run output is under ignored
apps/web/.next/playwright/contextual-assistant-results/stream046-final. Scoped test
and guide content hashes: evidence/browser-tested-files.sha256; production hashes
and dependency identity are captured by the root final-state manifest. DOM timing
assertions prove displayed cadence; backend cadence unit tests separately prove
125ms polling, since presentation smoothing also creates intermediate frames.

## T-1 remediation: measure actual wire delivery

The tester correctly identified that display smoothing can make DOM cadence pass
while transport remains batched. Added a second authorized real SSE subscription
through http://localhost:3336/api before sending the same progressive question.
It awaits its initial snapshot, validates each event with the canonical contracts
schema (native dynamic import preserves the ESM package boundary), timestamps
actual read packets, and considers only growing assistant content. It asserts
ordered prefixes and at least three receive intervals greater than40ms and less
than500ms. Same-packet zero-duration events do not qualify. Two subscriptions are
within the existing8-lease limit; no new signup/model turn, mocks or production
behavior change. Subscription is aborted and awaited in finally;30s signal bound.
No bearer or body logs; retained JSON contains only synthetic lengths and intervals.

The first focused attempt could not load ESM-only contracts via a static import
in Playwright's CommonJS test context. Automatic review rejected a proposed local
schema replacement as weakening validation, before it executed. Resolved the
module-loading boundary using native async import of the unchanged full canonical
schema. Focused official run `AUTH_E2E_RUN_ID=stream046-wire-focused` with
`pnpm test:e2e:contextual-assistant -- --grep 'saved source streams'` passed2API
and1browser (13.8s). Full official run using the same confirmed exclusive target
and a fresh random fixture Redis namespace, `AUTH_E2E_RUN_ID=stream046-wire-final
pnpm test:e2e:contextual-assistant`, passed2API (3.63s) and3Chromium (47.1s;
13.4s/10.0s/19.0s). All prior UI/activity/lifecycle assertions retained and passing.

Final rawwire23increasing content revisions, lengths4→91;21qualifying intervals
133.51–173.24ms; deliberately induced pause1150.73ms. Raw intervals and lengths
retained as evidence/wire-stream-timing.json. This independently proves subsecond
proxy delivery before UI smoothing and cannot pass on old one-second batch timing.
Screenshots and browser-tested-files.sha256 refreshed from final run.
Guide revision sha256:933d796afdfaae27; both mapped markers synchronized. Scoped
ESLint and guide check pass. Owned PostgreSQL/Redis containers removed after final
run; runner-owned backend/web stopped, tracked next-env restored. No ordinary data
or deployment affected.

## Final runtime check after R-1 hook race remediation

After SDK worker froze the cancellation/bootstrap race fix and its actual
useQuery/useChat regression passed, reran the exact full confirmed disposable
command above with AUTH_E2E_RUN_ID=stream046-r1-final. No test, fixture or guide
behavior changed for this run. Hook SHA256:
0fd8eb6b5a382e9450f84bcd813c3f10f237099d40fd212c2699590ad40b6107.

Result: exit0;2composed HTTP tests passed (6.56s),3Chromium journeys passed
(1.2minutes;21.5s source/Knowledge,17.9s dictionary/sharing,22.0s mobile lifecycle).
All waiting, progressive text, actual wire cadence, pause, persistence, Stop,
retry, no duplicate admission, accessibility/overflow/runtime-error checks pass.
Final wire23increasing content revisions4→91;18qualifying receive intervals
135.75–352.72ms; maximum observed inter-arrival827.71ms. Same-packet coalesced
frames excluded from qualifying cadence. Final wire JSON, four screenshots and
browser-tested-files.sha256 refreshed; production final manifest remains root-owned.

Fresh owned postgres:17-alpine/redis:7-alpine containers on55444/56444 removed
after final success. Ordinary developer PostgreSQL5432/Redis6379 untouched. Runner
stopped owned web/backend and restored next-env.d.ts. No model payments or remote
services/deployment. Earlier run timing above is historical evidence; current
retained screenshots/JSON represent this R-1 final run.

## Runtime check after S-1 queued-publication epoch guard

SDK worker froze hook eaafffad12d4b4c7b03cc7029e501161785923a3392d6f44e4a3249872c0c7b5
following terminal/ABA regression and26focused tests. Reran the same full confirmed
command with fresh owned disposable infrastructure and AUTH_E2E_RUN_ID=stream046-s1-final.
No browser/fixture/guide changes. Result exit0;2API tests32.50s,3Chromium1.3minutes
(26.1s/20.0s/23.2s). All maintained streaming/activity/lifecycle/placement assertions
pass, including actual unsmoothed wire cadence.23increasing message revisions,
lengths4→91;15qualifying intervals152.75–381.47ms; maxgap1207.76ms. Final retained
wireJSON/screenshots/browsermanifest refreshed from this run. Host slower than
prior runs but assertions passed with unchanged thresholds.

Owned PostgreSQL55444/Redis56444 containers removed; runner stopped owned
backend/Next and restored tracked Next types. Ordinary infrastructure untouched.
Source remained frozen throughout this run. Further source changes invalidate
relevant evidence and need root-directed scoped verification; this entry does not
preclaim finality for subsequent investigated races.

## Runtime check after R-2 per-subscription SDK ownership

Final source freeze received after29SDK/bootstrap/API/parser regressions, lint and
web typecheck. Tested hook SHA256
4aeb96a8999029914ef0317a06fa2fa9b27a201602b8239fefa98ba6c53fb749;
new lib conversation-stream-session.ts SHA256
435d18ea80d129b08fda7b2c67ca82cbad9c9591c7dade25126ab15a140650aa.
Ran exact same full confirmed command with fresh owned infrastructure and
AUTH_E2E_RUN_ID=stream046-r2-final. No fixture/test/guide changes in this run.

Result exit0;2composed API tests9.38s,3Chromium journeys1.7minutes
(source/private-note23.8s, dictionary/sharing18.5s, mobile lifecycle50.4s).
All maintained states/assertions green, no unexpected runtime/network errors.
Actual wire23increasing revisions4→91,19qualifying receive intervals
139.64–199.15ms; deliberate pause max1088.96ms. Final retained JSON/screenshots
and browser-tested-files.sha256 refreshed; manifest includes hook and new lib.

Removed owned PostgreSQL55444/Redis56444 containers, runner stopped its backend/
Next and restored tracked Next types. Ordinary data and paid providers untouched.
Earlier evidence entries are history; current retained artifacts reflect this run.
