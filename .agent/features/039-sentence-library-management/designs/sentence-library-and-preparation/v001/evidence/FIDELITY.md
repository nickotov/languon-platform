# Learner design integration evidence

Selected design: https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4
Provider artifact: `e4a89692-97c6-4fc0-8967-9ca6e8ecc40b`.
The frozen source manifest is one directory above this evidence directory.

The provider exposes React source, not reference screenshots. Fidelity is assessed
against the retained source inventory and local rendered captures; no pixel-level
reference comparison is claimed. Empty provider primitive files are replaced by
existing accessible application primitives and runtime design tokens.

| Requirement                       | Implementation and evidence                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIB-01 header and actions         | Card hierarchy, breadcrumb, dictionary language line, practice/preparation controls and preparation chip. Wide/narrow library captures.                                                                                               |
| LIB-02 filters                    | Desktop filter row; mobile filter sheet with the same inputs and apply action. URL filters, selection and loaded pages survive preview navigation through a persistent route layout.                                                  |
| LIB-03 sentence rows              | Source preview, direction/availability badges, personal archive state, checkbox, desktop controls and mobile action menu.                                                                                                             |
| LIB-04 selection and confirmation | Sticky selection surface, selected/version-pinned operations and frozen all-matching confirmation. Confirmation uses the server's exact snapshot count.                                                                               |
| LIB-05 states                     | Real empty dictionary, opposite-direction no-match, forced local transport failure with recovery to the real API, skeleton/list branches and bounded cursor navigation.                                                               |
| LIB-06 preview                    | Desktop drawer and mobile full-viewport dialog; source, expandable reference, contextual/whole-phrase hints and mappings. Before/after progress equality proves no practice side effect.                                              |
| PREP-01 setup                     | Off-by-default switch, full-dictionary versus round scope and mode/credit notices, alongside the established setup controls.                                                                                                          |
| PREP-02 progress                  | Closable responsive sheet, separate total/first-round bars, readiness rows, retained chip, background/reconnect behavior and stop/resume actions. Running/completed captures.                                                         |
| PREP-03 start/recovery            | Exact ready manifest launches without ordinary next/generation calls. Recovery notices follow exported tones/actions; expired manifests return to explicit setup. Cooldown, expired and access recovery have focused component tests. |

Contract adaptations are recorded in `FEATURE.md`: loaded counts with cursors,
private/shared scope rather than another user's identity, bounded selected lists,
and versioned restore from the removed view instead of an unsafe blanket Undo.
The design's synthetic scenario controls and timer-based jobs are excluded.

Preparation recovery uses the exported alert/progress structures. Browser presentation checks inject schema-valid read responses for credits, capacity, provider, model, stale, access, stopping and partial states after the real preparation/reconnect journey. These prove rendering and actions, not backend failure semantics; those are established by focused frontend tests and the independently reviewed real database/API checkpoint. Existing practice itself retains its selected design.
