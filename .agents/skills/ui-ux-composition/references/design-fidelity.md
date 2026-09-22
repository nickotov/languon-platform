# Supplied-design fidelity

Use this reference when implementing or reviewing fidelity to Magic Patterns,
Figma, screenshots, exported code, or another supplied visual specification.
The source defines the requested presentation; repository contracts define how
to implement it. Fidelity is not permission to copy scaffolding or invent
product behavior.

## Establish coverage before coding

For a design with a prompt/handoff, first read its DESIGN.md and the
[versioned handoff rules](../../../../.agent/DESIGN_HANDOFF.md). Select the
user-authorized revision and identify its design content before building the
inventory. Link the inventory/evidence back to that revision; a newer candidate
never silently replaces an implementation target or inherits verification.

1. Record the source link/path and revision, export, or capture identity in the
   active work record. Inspect the complete in-scope source, including nested
   components, tab contents, overlays, and conditional branches. A screenshot
   only establishes the states it actually shows; do not infer unseen designs.
2. Build a compact inventory from that source, not from the local implementation.
   Give each independently verifiable section, control group, and distinct state
   an ID. Include meaningful labels/help, icons, actions, responsive changes,
   empty and populated lists, dialogs and their cancel/confirm behavior, and
   loading/error/disabled states where provided. Preserve required app states
   even if the prototype omits them.
3. Map every row to a local component or intended owner, verification scenario,
   and disposition. Use the active correction/improvement record, or feature
   specification for requirements with evidence links in `EVIDENCE.md`; do not
   create a competing checklist elsewhere.

| ID    | Source requirement/state                       | Local owner      | Verification                     | Disposition |
| ----- | ---------------------------------------------- | ---------------- | -------------------------------- | ----------- |
| UI-01 | Account grid, labels, help                     | Profile details  | Narrow/wide rendered comparison  | Required    |
| UI-02 | Empty passkey card and CTA                     | Security section | Empty state                      | Required    |
| UI-03 | Populated rows and row actions                 | Security section | Safe populated fixture           | Required    |
| UI-04 | Revoke dialog, item name, copy, cancel/confirm | Revoke dialog    | Open dialog and exercise actions | Required    |

Scale the inventory to the task; do not enumerate individual CSS declarations.
Group equivalent repeated controls while retaining distinct states and actions.
Unsupported source capabilities need an explicit product disposition: implement
only already-authorized behavior, record an established unavailable presentation
if one exists, or ask for the missing decision. Do not silently omit controls,
ship success simulations, or mark a requirement complete by renaming it deferred.
New capability follows root delivery authorization rules.

If the supplied source is inaccessible, record exactly which portion cannot be
inspected, request the missing source when needed, and continue independently
verifiable work. A runtime-only approximation is not verified fidelity; leave
the affected requirements unresolved unless the user changes the scope.

## Adapt mechanics while preserving presentation

Map source pieces to shared primitives and real data/routing/state. Preserve
content, hierarchy, grouping, controls and meaningful interaction states rather
than using the closest primitive variant as an excuse to lose them. Record
material deviations with their reason, affected IDs, and evidence. Resolve
material product changes with the user; ordinary accessibility and platform
adaptations can follow established contracts within scope.

For public web, ADR-0017 makes the accepted Magic Patterns token names and values
the runtime contract, exposed through Tailwind v3 semantic utilities. Generic
plugin advice to approximate values or use the nearest legacy token does not
override it. Inspect actual tokens and primitive APIs; retain CSS Modules where
appropriate and existing `--sys-*` compatibility consumers. Do not rewrite all
styles or import a prototype's Vite/router/configuration, mock services, or
dependencies. New supplied tokens that conflict with accepted contracts require
an explicit resolution, not an automatic global theme replacement. Admin keeps
its Ant Design theme and native apps their platform contracts.

## Compare rendered states

Choose representative combinations covering distinct layout and behavior risks,
not every viewport × locale × theme × state combination. Include relevant
narrow/wide layouts, long content or translations, empty/populated data, hidden
tabs, and open dialogs. Match reference and local viewport, theme, locale and
data state where the source permits; disclose mismatches rather than asserting
equivalence. Use fake local fixtures through established test/data boundaries.

Capture or inspect reference and local rendering together. Record for each
inventory row its verified scenario, artifact/evidence link, observed difference,
and outcome. One default-page screenshot does not verify hidden or populated
states. Passing interaction tests does not establish visual fidelity. Conversely,
a screenshot does not prove that actions use the real application contract.

Use `$browser-verification` for local web/admin rendering without bypassing its
host restrictions to open an external design tool. Obtain reference artifacts
through the source's approved tools or provided files. Use appropriate device
verification for native surfaces.

Material deviations from requested sections, controls, states, or hierarchy need
user approval or an existing authoritative product/ADR disposition; name that
authority in the inventory. The implementing agent cannot approve its own
omission. Established accessibility/platform adaptations may be documented with
their rationale and evidence without inventing product decisions.

Fidelity completion requires all required rows implemented and evidenced, all
material discrepancies resolved or accepted by that authority within scope,
and required behavior/accessibility checks passing. Report remaining gaps
plainly. Regression screenshots protect a reviewed baseline; an initial local
baseline still requires source comparison.
