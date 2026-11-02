# Improvement: Formatted chat proposals and document preview

Status: Escalated
Created: 2026-10-30
Updated: 2026-10-30

## Routing decision and scope

Improve the existing Knowledge proposal review UX without changing acceptance,
draft publication, targets, API, persisted format, model execution or dependencies.
This is an improvement: a formatted inline view and a read-only modal expose the
existing validated document preview through the suggestion header. Preserve the
existing unrelated user grammar CSS comment.

Requested H1/horizontal-rule support is a separate feature boundary: the stored
contract currently accepts only H2/H3 and no horizontal-rule node; F049 explicitly
preserves that contract. Explicit feature authorization was requested under root
AGENTS.md; do not widen that schema before approval. The preview UX can proceed
independently against the current contract. No commit is authorized by this task.

Authorization subsequently received: the user selected **Authorize the document-format
extension**. Both formatting and preview are now delivered as DOC-1–DOC-5 in
[F059](../features/059-interactive-workbooks/FEATURE.md). Its existing four artifacts
own the active plan, source review and final evidence. This record preserves the
initial lightweight discovery; no further approval or duplicate lifecycle is needed.

## Acceptance

- Proposal cards display formatted content, retaining Markdown structure rather
  than truncating the source in the middle of syntax. Long content stays readable.
- A small eye beside the suggestion heading opens the complete proposed content
  through the same validated document renderer used by insertion/review.
- Desktop at1440px:720px dialog; narrower screens use the available width and
  mobile uses a full-width dialog. Long content scrolls with close control visible.
- A cross button has a localized Close tooltip/accessible name. Escape and the
  close control dismiss and return focus; opening/closing never accepts, changes
  a target or writes the document. Existing review/inline actions remain intact.
- Unsupported/unsafe input retains the existing explicit warning/literal fallback;
  no raw HTML, executable links, scripts or remote embeds are introduced.

## Design and implementation

Reuse shared Dialog, Tooltip, Button, native focus/Escape handling,
KnowledgeProposalContent/KnowledgeBody and existing semantic CSS tokens. Use a
private suggestion-preview component for modal state and chrome; keep the card
focused on header, formatted body and existing review action. Avoid changing the
shared dialog or Markdown acceptance policy. No external design or new dependency.

## Verification plan

- Focused proposal/card/format tests: real formatted nodes; modal read-only and
  dismissal; no acceptance or target restoration; hostile input remains inert.
- Mapped knowledge-workspace Markdown browser journey: inline formatting, eye,
  1440px/mobile geometry, long content, cross tooltip/Escape/focus, unchanged draft
  before apply and existing undo/Save/share behavior.
- Affected web typecheck/lint/styles, guide revision/mapping and docs validation.
  No AI execution/DB gate for the UI-only slice. Feature-format checks will be
  scoped separately if the user authorizes the persisted-contract extension.
- Proportional independent source/evidence review for overlay focus, target
  isolation and safe reused rendering after author preflight.

## Progress, evidence and remaining risks

Discovery complete; implementation and browser verification pending. Parent
F059 remains In progress for separately deferred transcription. This improvement
does not activate any provider/model/key or publish content. Removal restores
the prior card excerpt and removes the private modal without data migration.

Transferred scope resolution,2026-10-31: the F059 DOC continuation is complete and independently approved. See its final EVIDENCE.md and REVIEW.md; this escalation record remains historical.
