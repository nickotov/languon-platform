# Read-only decision probe — 2026-09-22

Agent: `/root/design_handoff_probe`. Fresh context; shared checkout, no writes,
services, delegation or external calls. Instruction inputs: AGENTS.md,
design-brief SKILL.md, DESIGN_HANDOFF.md, design-fidelity.md. No evaluator rubric
or expected outcome supplied. Five synthetic cases covered saved briefs,
same-URL updates while implementing an earlier version, response-only output,
unrequested backend-only briefs and inaccessible selected design sources.
The response below predates the explicit snapshot-boundary/ID/access clarifications.

## Agent response

These are workflow decisions from the four requested files, not executed verification.

1. **Saved brief for an implemented feature, no design yet**
    - Inspect the feature’s records, relevant implementation/contracts/tests, acceptance criteria, applicable ADRs and UI context. Distinguish source findings from historical test evidence.
    - Save the canonical prompt and stable-ID checklist at `docs/design-prompt/<slug>.md` unless another path was requested; update its index.
    - Create/update `DESIGN.md` beside the owning feature’s records. Cross-link feature, prompt, index and handoff without reopening the completed feature.
    - Freeze the exact prompt/checklist as `designs/<brief-slug>/v001.prompt.md` relative to `DESIGN.md`; record SHA-256, canonical base directory, Git revision, relevant working-tree changes, date, scope and delta.
    - Make `v001` the latest candidate, status `Awaiting design`, with a blank generated-design URL. Leave implementation target and last implemented unset unless genuine prior provenance supports them.
    - Include supported requirements, separately labeled recommendations and unresolved decisions. No application edits, design generation/upload, external design-tool calls or commit.

2. **Updated design at the same URL; continue implementing approved v001**
    - Append `v002`: changed external content requires a new version even when its URL is unchanged. Preserve v001’s snapshot, URL, approval and implementation history.
    - If only the design changed, reference the earlier prompt snapshot/hash; if the actual prompt used is unknown, record that limitation.
    - Record the supplied URL for v002, normally `Ready for review`; it is not approved by the prior v001 decision.
    - Set latest candidate to v002. Keep implementation target at v001 and retain its `Implementing` status. Last implemented stays unchanged.
    - Preserve identifiable design content through a provider revision or sanitized retained export/captures with date and hash. Continue v001 against its preserved content.
    - If v001 has no recoverable historical source, mark its identity unavailable and request that source when necessary. The mutable URL now cannot establish v001 fidelity. Continue independently supported work, but do not claim fidelity from the updated URL.
    - Keep evidence tied to its actual revision; v002 inherits neither v001 approval nor runtime verification.

3. **Response-only prompt update**
    - Return the proposed updated full prompt/checklist, preserved requirement IDs, changed rows and a concise delta prompt where applicable.
    - Include proposed handoff/revision content and provenance limitations directly in the response.
    - Write no canonical prompt, snapshot, hash artifact, index or `DESIGN.md`. Do not claim that a proposed revision has been durably recorded.

4. **Completed backend-only correction, no brief requested**
    - Do not invoke brief generation or create handoff/design artifacts. Brief generation is explicitly requested work, not a delivery gate.
    - Preserve completion status. An invisible backend change does not independently require a design update.

5. **“Implement v002,” mutable URL, no retained identity, source inaccessible**
    - Treat the explicit instruction as implementation authorization for v002; do not ask for a second design approval.
    - Read its handoff/current requirements, record the dated instruction, and select v002 as implementation target. Do not update last implemented.
    - Record exactly what cannot be accessed and that historical design identity is not established. Request an accessible export, revision-specific source or sufficiently complete captures when needed.
    - Apply normal delivery routing: design authorization does not automatically authorize new product capabilities or strategic changes.
    - Continue independently verifiable work supported by existing requirements, contracts and available evidence. Do not invent a source-derived inventory from the current UI or treat unseen states as inspected.
    - Once source is available, preserve its identity, build the source inventory, reconcile requirements, implement and perform reference/runtime comparison plus applicable behavior/accessibility checks.
    - Until then, affected fidelity requirements remain unresolved. Neither compilation, interaction tests nor local screenshots establish fidelity to inaccessible v002.

Material ambiguities:

- Root instructions require classifying every artifact-producing request, but do not clearly assign a workflow category to standalone brief creation for a completed feature. The skill explicitly supports this work without reopening that feature; whether it additionally needs a new correction/improvement record is unspecified.
- The revision statuses lack an explicit “source inaccessible” state. Recording the access limitation separately preserves the prescribed statuses without implying inspection or approval.
- “Exact snapshot of the entire prompt/checklist” does not explicitly settle whether surrounding source metadata belongs in the hashed snapshot. The selected snapshot boundary should be documented and used consistently; historical snapshots must remain immutable.
- The checklist and fidelity-inventory examples both use `UI-*` IDs, but the instructions specify linking them rather than an exact identity/mapping scheme. Preserve brief IDs and make mappings explicit so different inventories do not accidentally reuse an ID for different requirements.
