# Design prompts

Copyable Magic Patterns prompts and source-grounded UI checklists generated with
`$design-brief`. Each document keeps implementation and ADR links outside its
portable prompt, records source state and limitations, and preserves stable UI
requirement IDs for design review and later frontend verification.

| Prompt                                              | Scope                                                                                                        | Status                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [Dictionary and AI cards](./dictionary-ai-cards.md) | Dictionary library/settings, manual cards, inline AI authoring, saved-card AI review and pronunciation audio | Draft: supply Magic Patterns design-system reference |

Every saved brief also has a [versioned handoff](../../.agent/DESIGN_HANDOFF.md)
with a frozen prompt, generated-design URL slot, approval history and selected
implementation version. Start with the [dictionary card handoff](../../.agent/features/027-dictionary-pronunciation-audio/DESIGN.md).
Paste the URL into v001; later prompt/design changes append v002 and subsequent
versions. A mutable URL alone is not a preserved historical design.

Request generation or updates using the [prompt cookbook](../agentic-prompts.md).
The skill defaults to this directory; explicit response-only requests or custom
paths take precedence. A prompt does not establish backend deployment readiness,
design fidelity, or frontend completion. Feature specifications and accepted
ADRs remain authoritative.
