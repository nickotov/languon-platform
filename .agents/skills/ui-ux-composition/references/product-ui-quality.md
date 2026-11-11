# Product UI quality

Use for material hierarchy, interaction or disclosure work in product surfaces.
Follow the approved brief and existing runtime design system. Task-oriented UI
earns quality through clear information, familiar controls and precise states.

## Define the experience

Record a compact brief in the active work record, reusing settled requirements:

1. Name the user's task, immediate decision and successful outcome.
2. Identify runtime tokens, shared primitives/stories and a comparable pattern.
   A reference blueprint does not override the running kit.
3. Describe reading order and primary, secondary and destructive actions.
4. Set minimum, ordinary and large realistic content, including long localized
   text and actual field counts.
5. Specify entry, work, completion, on-demand detail and return-visit behavior.
   Separate local presentation from domain state.
6. Name the smallest useful isolated component/story and the app journey needed
   for behavior outside that boundary.

Exit: implementation does not need to invent these decisions. Existing design
approval rules apply; this reference adds no approval ceremony.

## Compose hierarchy and disclosure

- Lead with object identity and the next useful decision. Summarize a result
  before full detail. Keep actions near the task.
- Group using typography, alignment, whitespace, separators and existing surface
  tokens. Explain new card boundaries; repeated fields rarely need padded cards
  nested inside another card.
- Use compact scannable rows for long repeated content. Disclose secondary detail
  without hiding the information needed to compare, select or judge consequences.
- Separate selection from disclosure. Never nest a checkbox/button in a button
  or make expansion silently select an item.
- Choose paging, bounded content or action placement from the actual scroll
  container. Avoid competing scroll regions and sticky UI covering focus,
  content, dialogs or the mobile keyboard.
- Reuse the runtime color/font/icon vocabulary. A feature does not need a new
  palette, display font or entrance animation.

Initial and returning views need deliberate defaults. A newly completed result
may open for immediate review while history starts compact. Refetch/reconnect
must not override the user's current disclosure choice. Collapsing preserves
selection, progress and recovery. Loading, errors and outcome remain perceivable.
Use the smallest state owner: disclosure normally needs local UI state; persisted
domain state or URL synchronization needs a concrete product reason.

## Technical quality floor

Check actual rendered behavior:

- Semantic buttons/links, independently labeled controls, decorative icons hidden
  from accessible names. Disclosure exposes expansion state and works by keyboard.
- Visible, unobscured focus; logical order and overlay exit/focus restoration.
  Hidden panels do not retain reachable hidden controls.
- Existing legible text roles and contrast in relevant themes, including subtle
  surfaces, disabled controls and selection. Status is not color alone.
- Long text and translated labels wrap without page overflow or lost actions.
- Loading, empty, pending, error, retry and success retain the task and explain
  recovery. Announce outcomes without rereading the whole generated list.
- Give simple interaction state changes brief, purposeful motion: animate
  disclosure expansion/collapse and its affordance so users can follow what
  changed. Use existing duration/easing tokens (normally 120–200 ms), keep controls
  responsive during the transition, and avoid replaying animations on refetch.
  Preserve closing content long enough for its exit transition while immediately
  removing hidden controls from keyboard/accessibility interaction. Respect
  reduced motion with instant state changes. Motion should explain the task;
  do not add decorative entrances to every repeated row.

## Stories and rendered critique

Use the existing catalog for shared controls and visually meaningful leaves:
chat items, lexical cards, text and editor custom blocks. Render the actual view
with typed fake props and controlled callbacks. Keep feature/entity components
in their owning FSD layer, not `shared` just to make a story. A minimal provider
is appropriate when presentation needs it; real API/auth/model/worker calls are not.

Cover material compact/expanded, selection, long-content, pending/error and
realistic large-result states. Use global theme/viewport controls rather than
every Cartesian combination. App orchestration belongs in app tests.

Ask a fresh `ui-designer` for a bounded critique after rendering. Supply approved
direction, actual evidence and realistic volumes. Judge scanability, density,
action reachability, lifecycle and consistency separately from functional tests.
Return location, visible problem, user effect and correction; distinguish observed
defects, source inference and optional polish. Batch repairs and recheck affected
states, reusing the existing browser pipeline. A passing story/build is not visual
approval. Small corrections do not require this extra role.

## Provenance

Languon adaptation, modified2026-11-11, from selected
[Impeccable guidance](https://github.com/pbakaus/impeccable/tree/c1e0e5492fbb524f5df84d635ecfae7dc438ec45/.agents/skills/impeccable)
(Operate, shape, critique and craft-floor) and
[Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md).
License/notice files are retained under this skill's `licenses/` and recorded in
[repository provenance](../../../../docs/agent-skills.md). Only design guidance is
incorporated. Upstream engines, hooks, generated scores and automation are not
installed or required; local authority and browser wrappers remain in force.
