---
name: writing-for-agents
description: Create or revise Languon agent-facing instructions with reliable triggers, progressive disclosure, explicit authority, and checkable completion criteria. Use when editing `AGENTS.md`, `.agents/skills/**`, `.codex/**`, agent templates, durable workflow instructions, or documentation primarily consumed by coding agents. Do not use for ordinary product or developer documentation whose main reader is human.
---

# Writing for agents

## Establish the instruction contract

Read the governing repository instructions and each directly referenced
document whose rules or behavior the edit can change. Identify:

- the reader and triggering request;
- the behavior the instruction must change;
- its authority relative to root and closest `AGENTS.md`, active durable state,
  accepted ADRs, source/configuration, and other skills;
- the observable condition that proves the instruction worked.

Preserve one authoritative home for each rule. Point to existing commands,
configuration, schemas, or workflow documents instead of restating facts that
can drift.

## Design discovery and triggering

Put all invocation conditions in a skill's frontmatter `description`; the body
is loaded only after invocation. Use concrete tasks and boundaries, including a
short `Do not use` clause when adjacent skills could otherwise overlap. Keep
automatically invoked skills narrow. Set
`policy.allow_implicit_invocation: false` in `agents/openai.yaml` for
exploratory, destructive, expensive, or intentionally user-controlled
workflows.

For `AGENTS.md`, keep always-loaded routing concise and point to conditional
detail. Make pointers action-oriented: name both the condition and the document
or skill to read.

## Structure the instructions

Write ordered actions as steps and stable definitions or decision rules as
reference material. Keep the main path visible. Move branch-specific detail to
a directly linked sibling reference only when it materially reduces context;
avoid reference chains deeper than one level from `SKILL.md`.

End each substantial step with a checkable completion condition. Prefer bounds
such as “every acceptance criterion maps to evidence” over vague directions
such as “be thorough.” Keep concepts, rules, and caveats together.

Use positive target behavior. Reserve prohibitions for genuine guardrails and
pair them with the intended action. From the agent documentation being edited,
remove no-op encouragement, duplicated prose that merely caches discoverable
environment facts, and process history that does not change execution. Do not
delete environment files, dependencies, generated caches, or unrelated docs.

## Preserve Languon workflow boundaries

Do not let a focused skill redefine correction/feature classification, ADR
lifecycle, Git policy, security requirements, user-flow traceability, or the
Definition of Done. Link to those authoritative sources. When a new skill
affects an existing verification surface, route to the established local skill
instead of copying its workflow.

Every local skill requires:

- a folder whose name matches its lowercase hyphenated `name`;
- `SKILL.md` frontmatter containing only `name` and `description`;
- concise imperative instructions;
- matching `agents/openai.yaml` UI metadata;
- only resources directly required at execution time.

## Validate the result

Check likely positive and negative trigger examples, authority conflicts,
broken pointers, duplicated policy, and completion criteria. For every changed
skill folder, run the current `$skill-creator` package's `quick_validate.py`
against that folder and record the resolved command, then run affected Prettier
and documentation checks. For a complex skill, give a fresh subagent only the
skill path, a realistic request, and raw task artifacts. Success requires the
subagent to follow authority and scope, produce the requested output, avoid
unsafe side effects, and identify no material ambiguity; do not include the
expected answer or authoring rationale in its prompt.

## Provenance

This Languon-owned workflow is adapted from Matt Pocock's
`writing-for-agents` skill. The reviewed upstream source and license are
recorded in [`docs/agent-skills.md`](../../../docs/agent-skills.md); Languon
repository instructions remain authoritative.
