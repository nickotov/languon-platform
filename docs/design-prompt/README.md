# Design prompts

Copyable Magic Patterns prompts and source-grounded UI checklists generated with
`$design-brief`. Each document keeps implementation and ADR links outside its
portable prompt, records source state and limitations, and preserves stable UI
requirement IDs for design review and later frontend verification.

| Prompt                                              | Scope                                                                                | Status                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [Dictionary and AI cards](./dictionary-ai-cards.md) | Dictionary library/settings, manual cards, inline AI authoring, saved-card AI review | Draft: supply Magic Patterns design-system reference |

Request generation or updates using the [prompt cookbook](../agentic-prompts.md).
The skill defaults to this directory; explicit response-only requests or custom
paths take precedence. A prompt does not establish backend deployment readiness,
design fidelity, or frontend completion. Feature specifications and accepted
ADRs remain authoritative.
