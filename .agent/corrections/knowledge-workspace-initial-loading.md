# Correction: Knowledge workspace initial loading flash

Status: Complete
Created: 2026-10-30
Updated: 2026-10-30

## Scope and diagnosis

Established loading-state correction within the Knowledge screen. The workspace
query resolves before useEffect copies successful data into local working-draft
state. For one render query.isPending is false while workspace/edit remain null,
so DetailContent displays the unavailable error before the editor appears.

The API already propagates AbortError, and React Query consumes its AbortSignal.
Cancelled development requests during StrictMode/remount/observer cleanup are
expected; no evidence justifies disabling cancellation or changing navigation
request behavior. They are distinct from the successful-query hydration gap.

## Acceptance and verification

- Successful fetch/cache hydration remains loading until the initial branch is
  ready; it never renders a false unavailable state.
- Real request errors and invalid workspaces without branches still become
  errors rather than infinite loading.
- Preserve edits, recovery, authorization, retries and query cancellation.
- Targeted hook tests observe each render, including successful query data before
  effects hydrate local state. Root coordinates real browser verification with
  the broader block/chat task. No commit or service restart authorized here.

## Evidence

- Hook now exposes `isInitializing` while a successful workspace waits for its
  initial working-branch effect; the detail page retains the existing LoadingState
  through that render. A real request error or branchless result does not remain
  loading, preserving the existing unavailable/retry behavior.
- Regression: before implementation, 3 new tests failed while 3 existing recovery
  tests passed. The success case observes actual query-success/workspace-null
  renders before effects run; after implementation all 6/6 pass.
- `pnpm --filter @languon/web exec vitest run
tests/knowledge-workspace-recovery.test.tsx`: 6/6 passed.
- Web typecheck, scoped ESLint and formatting passed during focused verification;
  root's final integrated checks must cover concurrent block/chat changes.
  No navigation, auth, transport, query retry,
  AbortSignal or write/persistence behavior changed. `knowledgeApi` preserves
  AbortError, `useQuery` passes its signal to workspace fetch, and query observer
  disposal cancels that request rather than exposing a failure to mounted UI.
- Root observed successful hydration without a visible load-error alert in focused
  workbook runs ad2ba5a5,93ba8df3 and ae2b49ee. The visible role=alert probe excludes
  Next serialized translation/script data; the original body.textContent probe was
  invalid and remains a failed fixture attempt. These combined runs later failed
  unrelated new mention-fixture assertions and are not complete workbook gates.
  This bounded correction has its required rendered observation plus6 recovery
  tests. Parent F059 owns final combined gates/review. No user service restart,
  environment edit, API change or paid call was performed. No separate commit.

Logs: `/tmp/languon-workspace-loading-before.log`,
`/tmp/languon-workspace-loading-after.log`,
`/tmp/languon-workspace-loading-lint.log`.

Final combined canonical run44f4f1fb-cd1b-47f1-b5cf-68ca86f2ef30 passes14/14
flows and816/816 cases, including all3 workbook browser journeys and the visible
initial-loading probe. Parent evidence records the unchanged source fingerprint,
final static/build checks and independent review. This correction remains Complete.
