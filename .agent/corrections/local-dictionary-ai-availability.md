# Correction: Diagnose and repair local dictionary AI availability

Status: Complete
Created: 2026-10-14
Updated: 2026-10-14

## Routing decision

- Requested outcome: fix both AI availability failures or explain the required
  local setup. Deliverable: verified diagnosis, safe local environment repair and
  exact remaining authenticated Admin steps.
- Correction: existing generation setup only; no new journey, contract, schema,
  dependency, production infrastructure, policy or credential changes.
- Escalate before any strategic policy, migration or new capability change.

## Context and scope

- Menu advanced review depends on `single-card:v2` capabilities; the local API
  and worker allowlists supported only card-authoring and sentence jobs.
- Inline saved-card generation sends `card-authoring:v3`. The running backend
  advertises that format, but managed admission loads the immutable active
  provider revision, which lacks it and throws `generation_not_available`.
- Scope: read-only configuration/process/database diagnosis, six ignored local
  environment allowlists, and supported authenticated configuration instructions.
- Exclusions: direct database mutation, bypassing admission gates, provider/key
  changes, paid generations, restarts of the user's running services, UI edits.
- Constraints: ADR-0012 compatibility lifecycle; ADR-0021 immutable audited
  managed-routing configuration; backend infrastructure boundaries and redaction.
- Related state: features 021/022/031 and local provider-startup correction.
- Guide: `docs/user-flows/dictionary-platform.md`; behavior and commands remain
  established, so no guide/E2E revision required. No backlog task applies.

## Acceptance criteria and result

- AC-1 — Trace both symptoms to their exact gates. Passed: source, allowlisted
  process environment and read-only database evidence agree.
- AC-2 — Repair local format configuration without changing credentials or
  unrelated settings. Passed: append legacy/current `single-card:v1` and
  `single-card:v2` to five API lifecycle lists and the worker processable list;
  preserve all original card-authoring and sentence formats.
- AC-3 — Give exact supported remaining setup. Passed: restart backend and
  dictionary worker (or Stop/Start whole app), then save the same DeepSeek /
  deepseek-chat selection in Admin `/ai-settings` with a reason. Reason edits
  enable Save; PATCH creates a new immutable revision from the current catalog,
  including `card-authoring:v3` and `single-card:v2`. No model switch required.

## Verification and evidence

- Repository state: prior dev-panel correction files left intact; no app source
  edits for this outcome. `.env.local` remains ignored; no secret values printed
  or placed in this record.
- Actual inherited backend environment included `card-authoring:v3`; rejected
  stale API environment as the inline 503 cause. Worker was running.
- Read-only PostgreSQL target explicitly checked: APP_ENV development, loopback
  host, database languon; connection enforces default_transaction_read_only.
  Fresh DeepSeek observations were available and covered card-authoring v1/v2/v3.
  Kie observations were unverified; no credential changes needed or performed.
- Active managed configuration version 2 selected DeepSeek/deepseek-chat and
  enabled only that model. Its persisted formats were single-card:v1,
  card-authoring:v1/v2, pasted-terms:v1, import-pairs:v1, document-terms:v1.
  Missing v3 decisively rejects inline admission before provider dispatch.
- Source seams: DictionaryGenerationService supports/requireSupport;
  DrizzleTextAiAdmissionParticipant.resolve checks the persisted snapshot;
  DrizzleAdministrationStore saves current catalog supportedFormats into a new
  revision; Admin reason field marks the form dirty and permits resaving.
- Actual API and worker environment parsers validated the repaired local file,
  including both current formats. No paid/nondeterministic model calls or
  database writes made. Initial tsx CLI validation was sandbox-denied on its IPC
  pipe; Node's tsx import path avoids that CLI pipe.
- No new tests needed: local ignored configuration only; real parsers supply
  focused validation. No lint/typecheck/build change. No new browser behavior
  claimed; the full repaired UI journey remains unverified until the authenticated
  admin revision is refreshed and running services reload configuration.
- Author preflight reviewed exact six edited keys, immutable revision semantics,
  preserved credentials, prior work and final diff. No independent review needed
  for this local configuration change; no security policy or persistence changes.

## Remaining setup and risks

- User must restart the running backend and worker, then save Admin AI settings
  with unchanged provider/model and reason such as “Refresh formats after update”.
  The available Admin page requires the user's authenticated admin account;
  database writes bypassing it would discard its actor/audit protections.
- Refresh the dictionary page afterward to refetch capabilities. If a fresh
  attempt still fails, investigate its new correlation ID separately.
- Existing jobs remain pinned to prior immutable revisions. Adding legacy and
  current processable formats preserves their established compatibility rules.
- Rollback: remove only the two single-card entries appended to each of the six
  local lists; restart relevant processes. No schema or credentials changed.
