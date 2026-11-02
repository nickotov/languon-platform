# Standing local AI smoke allowance

Authorized by the user on 2026-10-31, until revoked or replaced by a later
instruction. This allowance covers separate, deliberate live verification after
AI-related changes; it never permits paid calls from automated tests or CI.

## Scope and limits

- Target: this local development installation only, using dedicated synthetic
  learner `ai-tester@testmail.test`. Credentials and exact account identity live
  in ignored `.env.ai-smoke.local`, mode 0600; never copy them into evidence.
- Approved route: `openrouter/openai/gpt-6-luna`, already enabled at authorization.
  No new model/provider, fallback, tariff, route publication or global-budget change
  is authorized by this allowance. A newly enabled route needs explicit inclusion.
- At most **USD 0.10 per learner dispatch**, **USD 0.50 combined per UTC day**,
  and **two learner dispatches per task**. Use the existing work-record slug as
  the stable task key; restarting a session does not create a new task allowance.
- Necessary activation checks: at most **USD 0.01 each**, within the same combined
  daily allowance and stricter existing MCP/application ceilings. Only recheck
  the affected route/flow when the read-only doctor shows it is needed. Use one
  stable operation key and inspect uncertain outcomes; never blind-retry.
- Initial account setup: one finite **200-credit** grant and **50 credits/action**.
  Credits are a separate customer unit, not a USD conversion. No unlimited policy,
  automatic refills or raising application/operator ceilings. Exhaustion is an
  explicit live-verification gap until the user authorizes a refill.

## Execution

1. Capture read-only affected-capability doctor readiness before editing and at
   handoff. Complete relevant deterministic production-composition tests first.
2. Use `pnpm ai:smoke` for preflight. `pnpm ai:smoke -- --initialize` creates the
   local quota journal only for an unused account; it never grants credits.
   `pnpm ai:smoke -- --run --task <work-record-slug>` deliberately dispatches one
   synthetic conversation through normal learner admission, execution, persistence
   and settlement. It does not replace changed-flow-specific proof: a conversation
   check alone proves neither dictionary generation nor audio transcription.
3. Keep the local quota journal, initialized marker and lock intact. The runner
   reserves the full maximum before dispatch, retains it after failure/timeout and
   refuses corrupt or missing state. Do not reset state, change task names, or
   create another account to bypass limits. Unknown outcomes require inspection.
4. Other affected flows and necessary MCP activation checks must first account
   for today's ledger reservations plus operator spent/held exposure and retain
   their exact operation/turn identity. Do not run them concurrently with smoke
   dispatch. If the guard cannot establish remaining allowance, stop paid work.
   Use only tiny synthetic inputs and the approved route. Extra/manual learner
   dispatches still consume the same two-per-task limit and must be recorded in
   the quota journal before execution; do not improvise an unguarded bypass.
5. Preserve existing funding policy: operator-funded conversations legitimately
   show free learner billing, while customer-funded conversations charge credits.
   In both cases require a settled provider expense and approved executed route.
   Record only safe metadata: task, timestamp, route, turn/check IDs, final status,
   measured/estimated/unknown expense and billing result. No passwords, access
   tokens, raw learner content or unsanitized server errors. Verify a usable
   persisted output, not merely an accepted request or admin probe.

Production financial admission remains authoritative. The local guard is an
additional conservative workflow limit, not a new server permission boundary.
Existing operator caps remain unchanged and can be stricter. The guard may count
unrelated operator expenditure conservatively and therefore stop early. Concurrent
unrelated local operator activity or changed configuration can also invalidate a
preflight; do not claim this is an isolated server-side USD allowance.

## Handoff and revocation

Report **implementation verified**, **local readiness**, and **live result**
separately. Stop on failed readiness, changed route, missing credentials, exhausted
budget, unexpected billing, timeout or indeterminate outcome; diagnose without
further paid calls. A second dispatch requires a concrete fix/diagnostic reason,
not a retry loop. This allowance makes covered actions explicit authorization;
there is no repeated per-task permission question.

If the user revokes or changes the allowance, update this policy before further
calls. Removing the ignored credentials disables the runner; preserve the quota
journal and accounting history. User acceptance, rather than a passing smoke,
triggers the retrospective in the existing delivery record.
