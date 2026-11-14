---
type: reference
title: Workbook guide implementation plan
source_paths:
    - apps/web/src/app/workbook
    - apps/web/src/fsd/pages/workbook-guide
    - apps/web/src/fsd/entities/learning-blocks
    - apps/web/src/fsd/widgets/app-shell
---

# Workbook guide

## Confirmed outcome

Public `/workbook` overview and `/workbook/exercises`, labelled **Workbook guide**
in guest/member sidebar. Saved `/workbooks` remain a distinct product resource.
All nineteen current named activities are playable one at a time. Real prepared
checks stay local. Illustrative AI feedback belongs to displayed preset responses,
never arbitrary typed answers. No model, credits, persistence or hidden generation.
Recipes copy prompts/material and explain Knowledge steps; ordinary Knowledge link
uses its existing authentication boundary. No automatic drafts or prompt-prefill.

## Experience

Overview explains bring material → ask → review → insert/save → practice. One
exercise chapter card and three recipe links provide concrete entry points. Future
chapters such as space appear only when implemented; no dead links.

Exercises start at V02. Four catalog categories lead to a compact activity selector,
then objective/checking policy, relevant visible source, actual exercise renderer,
when-to-use guidance, preset feedback and recipes. Desktop pairs navigation with
content; mobile preserves source → exercise → feedback → recipes order. Changing
activity/restarting clears local demo state. `?activity=` is validated against the
catalog and unknown values fall back to V02. Answers never enter URLs or storage.

Use one coherent English A2 passage, vocabulary and grammar corpus, with guide
instructions/explanations in en/ru/fr/es. This is the v1 example-language default,
not a restriction on real generation. Every activity has valid grounded question,
key/rubric, explanation and source. Presets demonstrate correct/partial/incorrect/
unassessed feedback, explicitly labelled as illustrative rather than real grading.

Three recipes: exact selected activity; suitable automatic choice; mixed practice.
Each describes source prerequisites, count/languages and expected reviewable
proposal. Copy success is announced; failure leaves selectable text. Material must
be prepared/selected in Knowledge before the prompt is sent.

## Implementation

Thin routes, server reading content plus client demo island in a pages-first
workbook-guide slice. Reuse LearningBlockView, catalog metadata and existing pure
ExerciseEvaluation through its public export. A presentation-only checking label
override keeps demo labels truthful without changing real checking semantics.
No onEvaluate callback or actual attempt submission. React local state only.

The corpus is typed and validated as a complete canonical Knowledge document,
including local source references and choice/gap keys. Never import backend test
fixtures. Only one interactive exercise mounts. Existing CSS Modules/tokens,
shared controls, localized metadata, keyboard/focus and reduced motion apply.
Static sidebar utility link is outside the authenticated Library; it has no
resource kind, pinning or recents and handles rail/drawer/dirty navigation.

## Delivery and acceptance

Feature branch/workflow owns specification, plan, implementation and evidence.
Commit planning, then corpus, UI/navigation and verified completion stages. Run
scoped unit/contract/component checks, web typecheck/build/style checks, real
public/member browser journeys at 390/768/1440 and independent completion review.
Prove all nineteen are reachable, source is visible, prepared checking works,
hybrid alternatives remain unchecked, sample feedback cannot grade arbitrary
input, reset/copy/deep links work, and no demo interaction sends domain writes.
Test sidebar matching against `/workbooks` and existing unsaved-work guards.
Update guides/mappings/architecture when relevant. Local squash merge retains
stage history; no push or branch deletion. No new endpoint, migration, provider,
environment variable, dependency, saved progress or analytics is planned.

## Implementation record

Implemented and verified in [Feature068](../.agent/features/068-workbook-guide/FEATURE.md).
Its evidence/review records own actual outcomes, resolved findings and scope limits.
