---
name: diagnosing-bugs
description: Diagnose difficult Languon failures with a tight, evidence-led feedback loop. Use for intermittent, cross-boundary, performance, concurrency, environment-specific, or unclear-root-cause bugs; failed tests whose cause is not already understood; and explicit diagnosis-only requests. Do not use for a routine correction whose cause and regression surface are already established.
---

# Diagnosing bugs

## Establish scope and authority

Read the applicable `AGENTS.md`, active correction or feature state, related
user-flow guides, accepted ADRs, relevant source, and recent changes. Respect
the request mode: diagnosis authorizes investigation and reporting, while
`fix`, `implement`, or `change` also authorizes an in-scope implementation.

Route test design through `$testing`; that routing does not expand a
diagnosis-only request into authorization to fix code. Use
`$browser-verification` or `$db-verification` when the symptom requires a real
browser or disposable database/cache evidence. Record material findings in the
active durable state when repository writes are authorized; otherwise include
them in the diagnosis report.

## Build a tight feedback loop

Define the smallest command or observation that distinguishes the reported bug
from correct behavior. Prefer, in order:

1. a focused unit, integration, contract, or existing E2E test;
2. a safe HTTP or CLI invocation against local fake data;
3. the repository browser wrapper for a rendered interaction;
4. a deterministic replay, differential comparison, profiler, or bounded
   stress harness;
5. a clearly documented human-assisted reproduction when automation is not
   practical.

Make the signal specific, repeatable, fast enough to iterate, and runnable in
the available environment. For a flaky bug, increase the reproduction rate and
record the observed frequency. If a faithful loop is unavailable, continue
with safe source and evidence inspection, state the confidence limit, and ask
for a redacted artifact or environment access only when it is genuinely needed.

## Reproduce and minimize

Confirm that the loop catches the user's symptom rather than a nearby failure.
Reduce inputs, state, timing, configuration, and participating modules one
factor at a time while preserving the symptom. Keep every remaining element
because evidence shows it is load-bearing.

Never expose credentials, authentication material, raw prompts containing user
data, or unnecessary personal data in commands, logs, or durable artifacts.
Replace sensitive values with `<REDACTED>`.

## Test hypotheses

Write three to five ranked, falsifiable hypotheses unless the minimized
evidence makes only one cause credible. For each, state the observation that
would support or reject it. Share the ranking as a concise progress update, then
proceed without waiting unless user knowledge is required.

Change one variable per probe. Prefer debugger or profiler evidence over broad
logging. Tag temporary instrumentation with a unique marker so cleanup is
verifiable. Measure performance before changing performance-sensitive code.

## Establish root cause and regression coverage

Trace the causal chain from triggering input or state through the failing seam
to the observable symptom. Distinguish root cause from contributing conditions
and incidental failures.

When a correct regression seam exists and a fix is authorized:

1. convert the minimized reproduction into a failing test when reasonably
   practical;
2. confirm that it fails for the reported reason;
3. implement the smallest correction allowed by the active workflow;
4. confirm the test passes;
5. rerun the original, less-minimized reproduction and affected broader checks.

If a reliable regression seam does not exist, record that architecture or
environment gap rather than adding a misleading test. A diagnosis-only request
ends with evidence, root cause, confidence, and proposed verification; it does
not authorize a code change.

## Clean up and report

Remove all temporary instrumentation and throwaway artifacts. Report the
reproduction command, minimized trigger, rejected hypotheses, causal chain,
regression coverage, verification results, and residual uncertainty. Update
the correction document or feature `EXEC_PLAN.md` and `EVIDENCE.md` when one is
active.

## Provenance

This Languon-owned workflow is adapted from Matt Pocock's `diagnosing-bugs`
skill. The reviewed upstream source and license are recorded in
[`docs/agent-skills.md`](../../../docs/agent-skills.md); Languon repository
instructions remain authoritative.
