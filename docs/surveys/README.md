---
type: index
title: Research surveys
---

# Research surveys

Surveys capture requirements, source-backed comparisons, recommendations, and
unresolved questions before implementation. They are research records, not
accepted architecture decisions or proof of provider quality.

| Survey                                                                                    | Research date | Scope                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| [Voice answers and pronunciation assessment](./voice-answers-pronunciation-assessment.md) | 2026-10-12    | Multilingual sentence practice, provider selection, credits, recording storage, and future standalone training. |
| [Multilingual text-to-speech playback](./multilingual-text-to-speech-playback.md)         | 2026-10-14    | Russia-access provider selection, web/native playback, multilingual voices, S3 audio reuse, and costs.          |

Use the repository [`$survey` skill](../../.agents/skills/survey/SKILL.md) with a
short description, for example:

> Make a survey of pronunciation assessment providers for multilingual voice answers.

The skill asks focused questions and saves findings here by default. It supports
normal automatic selection as well as explicit `$survey` invocation. Start a
new agent session after installation so the skill metadata is discovered.

Use descriptive kebab-case filenames and follow
[documentation metadata](../document-metadata.md). Inspect the index and candidate
frontmatter before reading existing surveys. Preserve the original research date
when merely saving prior findings; recheck time-sensitive claims before making
a provider or implementation commitment.
