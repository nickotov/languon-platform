---
name: design-brief
description: When explicitly requested, create or update a Magic Patterns design prompt and UI requirements checklist grounded in an implemented Languon feature or correction. Do not use automatically after delivery, for design generation/upload, or for frontend implementation.
---

# Design brief

Produce a copyable design-agent prompt, not backend documentation or a new
product specification. Root `AGENTS.md` retains workflow and authorization
authority. This skill is explicitly invoked; it is not a completion gate.

## 1. Establish the source and output scope

Read the named feature/correction/improvement record, applicable instructions,
relevant contracts, handlers/domain behavior, permissions, and focused tests.
Inspect existing UI/navigation and supplied design-system references when
available. Follow relevant accepted ADRs. Read only the feature's relevant paths.

Identify the user, goal, entry point, supported actions, data shown/entered,
validation, permissions, state transitions, asynchronous outcomes, and failure
recovery. Translate technical constraints into user consequences. Distinguish
source inspection from executed verification; do not call behavior tested unless
valid evidence supports it. Resolve specification/code conflicts explicitly.

Save the prompt and companion checklist by default in
`docs/design-prompt/<descriptive-feature-slug>.md`. Reuse the existing document
for that scope instead of creating duplicate briefs. Respect an explicit output
path or response-only/read-only request; the default never overrides it. Add or
update its entry in `docs/design-prompt/README.md` when saving in that directory.

Outside the copyable prompt, include creation/update date, source revision and
relevant working-tree changes, scope/status, verification limits, and relative
Markdown links to the dedicated feature `FEATURE.md` and `EXEC_PLAN.md` (or
correction/improvement record), relevant accepted ADRs, user-flow guide, and
implementation/contracts/tests used as evidence. Link historical `EVIDENCE.md`
when cited, without claiming those checks were rerun. If a source category does
not exist or apply, say so; never invent a feature or ADR just to fill the list.
Link the saved document from active work when applicable without reopening or
changing the status of a completed feature merely to store a design brief.
Existing acceptance criteria remain authoritative; reference their IDs.

Do not modify application code, invoke external design tools/MCP, upload source,
commit, or expand product scope as part of brief generation.

Exit: identify source revision/working-tree state, evidence limitations, output
location, and any behavior-affecting unknowns. If scope is unclear, ask a focused
question; continue the independently supported portion as a labeled draft.

## 2. Build a source-grounded UI checklist

Assign stable IDs such as `UI-01` to distinct user requirements. For each row,
record the requirement, classification, source/acceptance reference, relevant
states, and proposed design/runtime verification. Classifications are:

- **Supported requirement:** derived from established product intent and
  implemented behavior, with source evidence and any verification limits.
- **UX recommendation:** a suggested layout, grouping, default, or interaction
  that stays within supported capabilities; it is not an approved product rule.
- **Open decision / unsupported:** a gap or conflict requiring product input;
  exclude it from committed design requirements until resolved.

Cover the main journey and relevant alternatives: first use/empty/populated,
loading/pending, success/error, validation, permissions, destructive actions,
retry/cancellation, and responsive/accessibility/localization needs. Include
only applicable states. Backend support for cancel, retry, undo, search, bulk
actions, progress percentages, or optimistic completion must not be assumed.
Technical availability alone does not establish a user-facing product promise.

Exit: every in-scope user capability maps to a checklist item, and every required
control/state maps back to supported behavior or an explicit product decision.

## 3. Write the portable Magic Patterns prompt

Use this structure, adapting detail to the feature rather than padding sections:

1. App context: one or two sentences about Languon and its relevant audience.
2. Feature and user outcome: a fuller explanation of the problem, entry point,
   main journey, and supported actions in user language.
3. Required UI: screens/regions, displayed information, controls, interactions,
   rules, permissions, and state feedback; retain the checklist IDs.
4. UX direction: hierarchy, primary/secondary actions, grouping, useful defaults,
   feedback/recovery, keyboard/focus behavior, and responsive priorities. Label
   recommendations; allow design exploration within the supported contract.
5. Design system: use the user's existing Magic Patterns system and supplied
   reference/screens; preserve its components, tokens, typography, and patterns.
   If access or identity is missing, include a clearly marked reference slot and
   say the prompt needs it. Do not invent tokens or claim to have inspected it.
6. Boundaries: unsupported actions and unresolved choices; request no invented
   capabilities, fake successful operations, or silent requirement omissions.
7. Deliverables: coherent screens plus applicable state variants, with a mapping
   from UI IDs to the designed sections/states and explicit outstanding gaps.

Keep the prompt self-contained: Magic Patterns cannot be assumed to read local
paths or the agent conversation. Put necessary user-facing facts in the prompt;
keep source paths, code references, and verification provenance in the companion
checklist outside the copyable block. Use synthetic example data only. Exclude
credentials, personal data, internal hostnames, raw source dumps, and security
implementation details that the design does not need.

Exit: save the copyable prompt, source-grounded checklist, and decisions/access
needed before treating it as design-ready, unless the requested output mode
prohibits writes. Validate saved relative links and return the document link
with a brief summary rather than repeating its full content in chat. For
response-only requests, return the content directly. Do not block independent
supported design work because one region remains unresolved.

## 4. Update and hand off without losing coverage

For a correction, inspect the prior brief and changed behavior first. Preserve
unchanged IDs; mark removed/superseded requirements with reasons rather than
reusing their IDs. Update the saved canonical prompt/checklist and source metadata
to current behavior, and include changed rows and a short delta prompt for an
existing design. Do not leave obsolete instructions as the current full prompt.
Respect response-only requests by returning the proposed update without writes.
An invisible refactor needs no
design update: explain that conclusion with source evidence, without filler.

When the design returns, reconcile its coverage against these IDs before coding.
Route actual design integration through `$ui-ux-composition` fidelity mode and
the applicable integration skill. Link these requirements to the design's
source inventory and later runtime evidence; a design brief does not replace
that inventory, product authorization, or browser/device verification.

Finish when supported scope and relevant states are covered, suggestions and
unknowns are clearly separated, the prompt is portable and sanitized, and any
saved brief has valid source links and an index entry (when in the standard
directory), and is linked from active work when applicable without claiming
frontend completion.
