---
type: survey
title: Product UI design skills and review workflow
research_date: 2026-11-11
summary: Compare design skills and propose a project-native design role, using dictionary chat snippets as the acceptance case.
source_paths:
    - .agents/skills/ui-ux-composition/**
    - .agents/skills/frontend-development/**
    - .codex/agents/**
    - apps/web/src/fsd/features/dictionary-chat-snippets/**
    - apps/web/src/fsd/shared/ui/**
    - apps/web/src/app/globals.css
    - apps/web/src/app/styles/geometry-tokens.css
    - design/DESIGN_SYSTEM.md
---

# Product UI design skills and review workflow

## Decision and recommendation

User approved this setup and the compact snippet direction on2026-11-11, adding
isolated stories for shared UI and meaningful presentational leaves. Adoption and
runtime evidence are owned by the
[improvement record](../../.agent/improvements/product-ui-design-quality.md).
The comparison below retains the research and recommendation that informed approval.

Adopt a **project-adapted product design workflow**: strengthen the existing
`ui-ux-composition` skill with selected Impeccable product-design guidance and
Vercel interaction checks, and add one bounded `ui-designer` role for substantive
UI composition and independent visual critique. Keep the existing frontend and
browser skills as the implementation and runtime-verification authorities.

This is a proposal. The user requested research first, agreement before adding
the chosen setup, and then a `DictionarySnippetCard` improvement. No external
skill, hook, agent configuration or application change is installed by this survey.

The strongest fit is Impeccable's **Operate** guidance: task completion,
scanability and consistent controls take priority over visual novelty in app UI.
Its product guidance is much closer to this problem than a landing-page art
direction skill. [Impeccable Operate source](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/reference/operate.md)

Documentation and popularity do not establish that a skill improves Languon.
The proposed first evaluation is the user's actual 50-card chat scenario,
including initial generation and reopening history. No comparative benchmark
has been performed.

## What went wrong in this project

The screenshot shows one full lexical entry taking most of the chat viewport,
with 50 selected cards and no way to collapse the whole result or individual
entries. The block has an outline but little distinction from its surrounding
surface. The screenshot also shows a reconnection message; transport behavior
is outside this UI research and is not diagnosed here.

Source inspection confirms that `DictionarySnippetCard` renders all items and
their complete fields unconditionally. Its insertion actions follow the entire
list. There is no disclosure state or distinction between newly generated and
historical snippets. `SnippetFields` repeats source text in a selection label
and the field body. These are information hierarchy and lifecycle problems,
not merely missing color or padding.

The current [composition reference](../../.agents/skills/ui-ux-composition/references/composition.md)
already mentions optional disclosure; the
[review checklist](../../.agents/skills/ui-ux-composition/references/review-checklist.md)
mentions hierarchy, density and long content. The feature's browser journey,
however, uses three generated cards. It proves selection and insertion, not
that a 50-card result is a usable chat artifact. Functional success was accepted
without a concrete density or first-view/revisit contract. This is the main
project-specific finding; installing another broad checklist alone would leave
it unresolved.

## Existing authority and reuse

[ADR-0016](../adr/0016-runtime-ui-kit-authority.md) makes runtime tokens, shared
primitives, stories and verified behavior authoritative.
[ADR-0029](../adr/0029-web-css-modules-and-geometry-tokens.md) requires owned CSS
Modules and canonical geometry tokens.
[ADR-0054](../adr/0054-ui-direction-before-implementation.md) already establishes
approval for a new visual direction. These decisions remain intact.

The blueprint in `design/DESIGN_SYSTEM.md` describes a calm adult learning
product, but its illustrative colors and fonts differ from current runtime
values. A new agent must inspect `globals.css`, `geometry-tokens.css` and actual
components, rather than copy the blueprint palette. Relevant existing sources
include shared `Card`, `Button`, `Checkbox`, `IconButton`, badges and their
stories. Contextual chat already uses collapsible materials and a
`DraftComparison` disclosure. No external component library is needed.

## Shortlist

| Candidate                    | Verified capability                                                                                         | Fit and limitation                                                                                                | Proposed disposition                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Impeccable                   | Separate product mode; planning, design critique and technical audit playbooks                              | Strong design reasoning; current complete distribution includes substantial automation and workflow requirements  | Adapt selected guidance into the current skill          |
| Vercel web-design-guidelines | Source review covering keyboard, focus, forms, content, responsive behavior and other web interaction rules | Useful quality floor; code compliance does not establish hierarchy or aesthetic quality                           | Add a reviewed local reference, with project exceptions |
| Anthropic frontend-design    | Intentional visual direction, typography, layout and self-critique                                          | Useful baseline, but broad identity/hero guidance needs product-specific restraint                                | Reference; avoid another overlapping default skill      |
| UI/UX Pro Max                | Searchable design/UX catalogs and stack-specific guidance                                                   | Useful when exploring a new system; a catalog does not decide the correct lifecycle or density for this component | Optional future research tool                           |
| Taste Skill                  | Company-site composition, assets, art direction and browser checks                                          | Current rules prioritize page-scale presentation and required visual/motion treatments                            | Do not use as the default authenticated-app workflow    |

Primary evidence:

- [Impeccable skill, version4.8.2 at research time](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/SKILL.md)
  distinguishes task-oriented interfaces from expressive surfaces and preserves
  an explicit brief. Its
  [shape playbook](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/reference/shape.md)
  asks for realistic data ranges, lifecycle states and constraints before code.
  These are the useful additions for Languon.
- [Vercel's skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)
  fetches its upstream rules for every review.
  [The rules](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
  address visible focus, unobscured controls, long content and destructive-action
  protection. Some generic prescriptions, such as synchronizing expanded panels
  into URL state, need project-specific judgment; a chat disclosure should not
  automatically create a routing or dependency change.
- [Anthropic's actual skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
  provides a deliberate plan/build/critique process and explicit attention to
  wording, hierarchy and restraint. It is not a substitute for defining repeated
  collection behavior.
- [UI/UX Pro Max's implementation guidance](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/src/ui-ux-pro-max/templates/base/skill-content.md)
  offers focused component searches and local Python catalog queries, alongside
  broader design-system generation. Its catalogs are inputs, not measured
  evidence of better Languon outcomes.
- [Taste Skill's actual current instructions](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md)
  require screen-scale sections and animation treatments appropriate to company
  websites. Those defaults are a poor match for a compact learning editor.

The skills directory reported approximately400K installs for
[Impeccable](https://www.skills.sh/pbakaus/impeccable/impeccable) and849K for
[Vercel's guidelines](https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines)
on the research date. Impeccable's directory entry also reported approximately108K
repository stars. These are adoption signals, not quality or security certification.
The official Anthropic skill also appears prominently in the
[directory](https://www.skills.sh/). Sources and actual instructions, rather
than popularity alone, determine the recommendation.

## Why selective adaptation rather than installing everything

Impeccable's current
[distribution](https://github.com/pbakaus/impeccable/blob/main/README.md) includes
a self-contained engine, optional hooks and live editing. Its documented live
copy fallback may invoke another coding CLI with approval/sandbox bypass flags.
Its full
[critique playbook](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/reference/critique.md)
requires two isolated assessments and additional detector/reporting steps.
These capabilities are not necessary to design this component and would add
another execution and verification workflow to a repository already controlling
those concerns.

The proposal therefore adopts reviewed design guidance, not that executable
workflow. It does not enable live overlays, automatic hooks, binary downloads,
approval bypasses, new runtime dependencies or automatic updates. If upstream
text is copied or adapted, pin its source revision and retain applicable license,
notice and change attribution. Do not describe a trimmed local adaptation as an
unmodified installation or a completed official Impeccable critique.

The current Impeccable `frontend-design` alias is deprecated; recommending that
old name from an installation list would be misleading. Use the current source
identity during adoption. [Deprecated alias](https://www.skills.sh/pbakaus/impeccable/frontend-design)

For comparison, the upstream installation entrypoints are shown below. These
commands have **not** been run and would install the upstream skills, rather
than the proposed selective project adaptation:

```sh
npx skills add https://github.com/pbakaus/impeccable --skill impeccable
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
```

## Proposed project integration after approval

1. **Improve the existing composition skill.** Add a concise product-UI reference
   covering task hierarchy, information density, disclosure, lifecycle state,
   action placement and intentional visual grouping. Keep one routing entry;
   do not install several overlapping default design skills.
2. **Add one `ui-designer` role.** It reads the relevant task and runtime design
   system, then returns a small interaction/layout brief before substantive UI
   implementation. It later critiques the actual rendering. The role focuses on
   design and review; implementation remains with the owning frontend agent.
   Existing browser tools/wrappers retain their authority and restrictions.
3. **Use concrete review criteria.** Report location, visible problem, user
   consequence and suggested correction. Require a reasoned judgment about
   usability, not a generic checklist pass or an unsupported numeric score.
4. **Keep context small and authoritative.** Link to tokens, shared component
   stories and approved comparable screens. Do not create a second palette,
   component library or design-system source of truth.
5. **Scale review to scope.** Use the role for new screens and material interaction
   or hierarchy changes. A label, token or small spacing correction does not
   require an extra agent or a new user approval. Reuse approved direction and
   one realistic browser setup; batch findings and validate affected repairs.

Expected files are the existing `ui-ux-composition` skill/references, a focused
`.codex/agents/ui-designer.toml`, short routing pointers where needed, and
provenance in the existing agent-skills documentation. The approved scope, not
an upstream instruction, determines agent authority.

The new decision rules should require these answers before a material UI change:

- What must the user understand and do first?
- What is visible initially, on demand, after completion and on return?
- What happens with minimum, ordinary and large realistic content?
- Which controls stay visible/reachable during the task?
- How do sections differ through hierarchy, surface and spacing?
- Which exact runtime components/tokens are reused?

After rendering, review those answers against real content at relevant widths
and themes. Passing interaction tests is separate evidence from a satisfactory
design judgment.

## Dictionary snippet proposal to exercise the workflow

Treat the generated result as one identifiable, collapsible artifact in chat.
Use an existing subtle surface and clear header boundary, restrained iconography,
the title, card count and language direction. The compact state might read:

```text
▸ Shopping in France                         50 cards
  French → Russian                 Review cards
```

On expansion, show a concise selection toolbar and compact source/translation
rows, rather than every field of every card:

```text
▾ Shopping in France                         50 cards
  Select all                              50 selected

  ☑ Bonjour                  Здравствуйте           ▸
  ☑ le magasin               магазин                ▸
  ☑ faire les courses        делать покупки         ▸
  …

  Append     Prepend                         Replace
```

The diagram is an interaction proposal, not rendered evidence or a final visual
design. In particular:

- The **outer artifact opens once when a new snippet arrives from generation in
  the currently open chat**. It is manually foldable. Opening chat/history or
  reloading starts retained artifacts compact. Ordinary refetch/reconciliation
  must not repeatedly reopen a result the learner folded.
- Individual entries start compact even when the new outer artifact opens.
  Each entry can reveal its full immutable enabled fields. Selection and
  expansion are separate controls; changing one must not trigger the other.
- Collapsing does not clear current selection or interfere with an in-flight
  insertion. Status and actionable errors remain perceivable. Preserve exact
  retry semantics, source ordering and existing Replace confirmation.
- Use compact rows with separators, rather than another independently padded
  card surrounding every field set. Keep insertion controls reachable for50
  cards; choose a bounded list/pagination or an unobscured local toolbar based
  on the real chat scrolling container, not blindly add a nested scroll area.
- Preserve all generated fields on demand and editing after insertion. Append,
  Prepend and destructive Replace keep clear labels and distinct hierarchy.

This applies
[progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
to detailed review content while retaining the primary task. Disclosure controls
need keyboard activation, a visible affordance and exposed expansion state;
selection remains independently labeled.
[WAI disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)

## Validation and approval boundary

First validate the approved instruction changes through the repository's skill
metadata checks and a bounded fresh-context design probe. The probe should detect
this class of problem from realistic inputs; its rubric must not be supplied as
the answer. Do not claim comparative savings or design quality from packaging
validation alone.

Then implement only the agreed snippet presentation and client disclosure state.
Use focused component coverage for new-versus-history behavior, manual folding,
independent row selection/disclosure and refetch stability. Use realistic10/50/100
card fixtures where each exposes a distinct boundary; browser-review the50-card
case at desktop and narrow widths, including reopen, action reachability, long
Russian/French text, keyboard and applicable theme contrast. Preserve existing
insertion/retry checks and update the affected user-flow guide and scenario.

The visible evidence is the pilot for the adopted workflow. AI generation,
accounting, database and provider behavior are unchanged by the proposed UI
improvement, so their full regression suites are not selected by default. No
paid generation is needed. Broaden only if implementation reveals another
affected invariant.

The research handoff waited for the user's choice before installation or application
edits, as requested. That approval is now recorded above; normal reversible
implementation and verification proceed without repeated routine permission questions.
