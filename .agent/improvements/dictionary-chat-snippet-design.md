# Improvement: Dictionary-chat snippet design discovery

Status: Complete — shared understanding confirmed; implementation handed to feature063
Created: 2026-11-11
Updated: 2026-11-11

## Routing and authority

The user explicitly invoked GrillMe's grill-with-docs workflow to interview and
document a proposed dictionary-chat capability. This record owns documentation
and product-language clarification only, not application development. The intended
capability crosses feature boundaries (a new chat tool, typed proposal and
dictionary apply behavior); correction/improvement implementation does not apply.
Do not implement, create a feature branch or mark the design agreed until the
interview frontier is resolved and the user confirms shared understanding.

No code, API, schema, prompt, dependency, data or configuration change is in scope.
Existing feature061/062 work and its release/security remainders are unrelated.
Stay on the current branch; no automatic commit/merge. Rollback of documentation
does not affect application behavior.

## Intended outcome stated by the user

The dictionary's contextual assistant can propose words/phrases using that
dictionary's context and settings. The result contains complete structured cards.
The learner can add it to the current dictionary through Append, Prepend or
Replace, preserving the usual card validation and the existing AI grammar,
article, gender and inflection rules.

## Settled decisions

Round1: user accepted Q1/Q2 recommendations. Round2: user accepted Q3/Q4/Q8/Q9
and simplified Q5/Q6/Q7. Round3accepted Q10/Q12 and clarified Q11: duplicates
are allowed with notification and remain the learner’s responsibility. Later
choices supersede editable-chat recommendations.

- D1 — The dictionary snippet is read-only in chat. The learner can select all or
  individual cards and explicitly Append, Prepend or Replace. No content mutation
  occurs before that action; normal dictionary editing happens after insertion.
- D2 — Replace targets the entire current active card list, not a prior selection
  or filtered subset. Preserve title/settings; confirmation shows affected count.
- D3 — Archive replaced cards with identities/history intact. Insert new cards with
  fresh identities/progress; no implicit matching-card progress inheritance.
- D4 — Duplicates are allowed with a non-blocking notification; the learner is
  responsible for them. No silent merge, skip or duplicate-prevention gate.
  Check the final list for Replace and existing+new cards for Append/Prepend.
- D5 — No in-chat field editor or editable draft. AI generation preserves grammar/
  article rules; insertion does not invoke AI. Ordinary edits after insertion use
  the existing manual editor.
- D6 — No special stale-settings notice, forced refresh or automatic regeneration.
  The learner is responsible for the suitability of the generated values if they
  change settings. Apply is intended to behave like manual insertion under current
  settings, retaining normal authorization, field and concurrent-save validation.
- D7 — No editable review draft, chat field editor or draft-autosave mechanism.
- D8 — Initially owner-only; a shared reader can make a personal copy first.
- D9 — Default to ten cards when quantity is unspecified, subject to ordinary
  generation limits; derive languages/fields from dictionary settings.
- D10 — Retain read-only snippets in ordinary private chat history across
  navigation/reload, under existing conversation/source availability rules.
- D11 — A snippet is reusable for all/selected cards, including deliberate
  duplicate insertion. No per-card consumed state is required. Network retries of
  the same application remain idempotent; distinct user applications are allowed.
- D12 — AI follow-up requests generate a new snippet using the exact original
  snippet content. Preserve the previous result; neither result edits the
  dictionary automatically.
- Language — “Dictionary snippet” is recorded in root CONTEXT.md: proposed cards
  for an existing dictionary, not a new dictionary resource.

## Source-backed findings

- Manual card creation and batch AI acceptance already validate ownership,
  settings/dictionary versions, fields, capacity and revisions. Both currently
  append; there is no dictionary-wide Prepend/Replace apply operation.
- Existing AI batch generation freezes settings/languages/context and returns
  durable review candidates separately from transactional selected-card acceptance.
  AI provenance is trusted server state; manual-style insertion must not relabel
  AI-produced content as human-authored.
- Grammar/articles are prompt rules, not deterministic trimming/validation.
  Card-authoring rules are more explicit than the current pasted-terms prompt;
  preserve the stronger appropriate-language policy rather than assume all
  generation paths already share it.
- Dictionary chat is currently contextual read/explanation chat. Knowledge
  workspace proposals and learning blocks do not grant dictionary write authority.
- Duplicates currently warn rather than reject. Normal manual edits preserve the
  user's text; persistence itself does not invoke AI grammar correction.
- Archive/restore preserves the same card identity and learning history;
  archive excludes it from active practice. New cards, even with the same words,
  receive new identities and fresh progress. Permanent deletion removes linked
  learning history. Restore currently appends the old card rather than recovering
  its former position.
- Existing generated proposals survive reload, but unaccepted review edits are
  currently client-side. The user rejected editable chat drafts and chose
  retention/reuse of the original read-only snippet in ordinary chat history.

Primary references: ADR0011, ADR0024, ADR0037 and ADR0055;
`docs/user-flows/dictionary-platform.md`;
`docs/user-flows/contextual-language-assistant-and-knowledge.md`;
dictionary creation/batch acceptance and conversation source/tool implementations.
Two read-only investigators checked backend/package and web/chat paths.

## Design tree and final confirmation

Product frontier is empty after rounds1–3: destination/current settings, grammar,
read-only selection, explicit application modes, archive/progress semantics,
non-blocking duplicate notification, owner-only scope, default ten, persistence,
repeated use and AI follow-ups are settled.

The final user-facing understanding check will include bounded ordinary defaults:
preserve selected order; require at least one selected card; apply selected cards
atomically; keep ordinary validation/authorization/concurrent-save protection;
no silent truncation or automatic extra paid batches when limits are exceeded.
These are normal save/execution safeguards, not a stale-snippet workflow. No
one-click replacement Undo or exact old-position restoration is promised.

The user confirmed the full summary and explicitly authorized implementation.
This design interview is Complete; feature063now owns implementation, validation
and review. No application changes are attributed to this design-only record.

## Accepted architectural record

[ADR-0057](../../docs/adr/0057-dictionary-chat-snippet-application.md) is Accepted
within the user's confirmed feature063scope. Chat snippet application separates
generation provenance from ordinary current write validation, preserving ownership
and concurrency without stale-notification/regeneration gates. Its narrow partial
supersession of ADR0011does not change asynchronous batch acceptance or other
proposals. The accepted older body remains historical; relationship metadata links
its exception. Implementation evidence is owned by feature063.

## Proportional verification and current evidence

Only glossary/design documentation is edited. Source discovery is read-only;
no application/DB/browser/model execution is needed or claimed. Check changed
Markdown formatting, links when present, glossary consistency and scoped diff.
The chosen decisions are recorded; final shared understanding is not yet
confirmed. No implementation readiness or authorization is implied by this record.

## Interview completion

User confirmed the complete summary and explicitly requested implementation on
2026-11-11. Design-only work is complete; [feature063](../features/063-dictionary-chat-snippets/FEATURE.md)
owns source/evidence/review. ADR0057 is accepted for the confirmed narrow policy.
This confirmation is design acceptance and implementation authorization, not proof
of runtime completion or production release. Later implementation does not reopen
settled product choices absent a material contradiction.
