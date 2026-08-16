# Repository agent skills

Languon keeps project-specific Codex workflows under `.agents/skills`. They are
reviewed repository source, versioned with the behavior and architecture they
govern, and discovered when Codex starts in the project root.

## Authority and invocation

Skills add focused execution guidance. They do not supersede the closest
applicable `AGENTS.md`, active correction or feature state, accepted ADRs,
source and configuration, or the repository Definition of Done. When a skill
touches an established verification surface, it routes to the existing
Languon testing, browser, database, review, and user-flow skills.

Invoke a skill explicitly with its `$name` when you want to require it. Codex
may invoke other skills automatically when their frontmatter description
matches the task. `prototype` and `improve-codebase-architecture` are configured
for explicit invocation only because they create exploratory work rather than
routine delivery steps.

Start a new Codex session after adding or changing repository skills so their
descriptions and UI metadata are reloaded.

Run `pnpm agent-skills:check` after every skill change. The validator checks all
repository skill frontmatter, directory/name agreement, required Codex UI
metadata, default prompts, size bounds, and explicit-only invocation policy.

## Locally adapted engineering skills

The following skills are Languon-owned adaptations. They were written locally
rather than installed from an external package, so upstream changes never alter
the repository automatically.

| Local skill                      | Purpose                                                                                             | Original reference and Languon adaptation                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$diagnosing-bugs`               | Build a tight evidence-led loop for unclear, intermittent, cross-boundary, or performance failures. | [Original `diagnosing-bugs`](https://github.com/mattpocock/skills/tree/068b6e0c62393147daf03530149cdce209c93da8/skills/engineering/diagnosing-bugs). The local version permits bounded source/evidence inspection when faithful reproduction is unavailable, respects diagnosis-only scope, and routes verification through Languon skills and durable state. |
| `$writing-for-agents`            | Create concise, discoverable, non-duplicative agent instructions.                                   | [Original `writing-for-agents`](https://github.com/mattpocock/skills/tree/068b6e0c62393147daf03530149cdce209c93da8/skills/productivity/writing-for-agents). The local version makes Languon's authority hierarchy, skill metadata, validation, and workflow boundaries explicit.                                                                              |
| `$domain-modeling`               | Reconcile product language with domain behavior, contracts, guides, and code.                       | [Original `domain-modeling`](https://github.com/mattpocock/skills/tree/068b6e0c62393147daf03530149cdce209c93da8/skills/engineering/domain-modeling). The local version keeps glossary creation lazy, distinguishes stable cross-feature language from feature-local terms, and uses Languon's existing ADR policy.                                            |
| `$codebase-design`               | Evaluate module depth, seam placement, caller burden, locality, and testability.                    | [Original `codebase-design`](https://github.com/mattpocock/skills/tree/068b6e0c62393147daf03530149cdce209c93da8/skills/engineering/codebase-design). The local version retains established DDD, FSD, HTTP, React, package, port, and adapter terminology instead of imposing a competing vocabulary.                                                          |
| `$prototype`                     | Answer one product, state-model, interaction, visual, or feasibility question with disposable code. | [Original `prototype`](https://github.com/mattpocock/skills/tree/068b6e0c62393147daf03530149cdce209c93da8/skills/engineering/prototype). The local version uses temporary, dependency-free artifacts by default and never creates unmanaged branches or commits.                                                                                              |
| `$improve-codebase-architecture` | Survey a bounded subsystem for evidence-backed deepening opportunities.                             | [Original `improve-codebase-architecture`](https://github.com/mattpocock/skills/tree/068b6e0c62393147daf03530149cdce209c93da8/skills/engineering/improve-codebase-architecture). The local version is report-only, uses accepted ADRs and existing terminology, defaults to Markdown, and avoids CDN or GUI side effects.                                     |

The original references came from
[`mattpocock/skills`](https://github.com/mattpocock/skills), reviewed at commit
`068b6e0c62393147daf03530149cdce209c93da8` on 2026-08-16. That repository is a
design reference only; Languon does not install, execute, or automatically
update it. Review upstream diffs and reapply useful changes deliberately to the
local skills.

## Upstream license notice

The referenced skills are published under the MIT License. The notice below is
retained for the adapted material:

```text
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
