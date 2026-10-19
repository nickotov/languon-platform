# Smooth tutor streaming and activity states

Status: Complete
Owner: Codex
Created: 2026-10-19

## Authorization and problem

User authorized feature delivery and requested a checkpoint first. Prior completed
positioning improvement committed as e83bc49. Deliver on feature/smooth-tutor-streaming.
The tutor emits large visible bursts and loses its working indicator before text.
Code findings: fixed1000ms SSE polling, full canonical replacements into useChat,
empty assistant placeholders already marked streaming, static Markdown renderer.

## Acceptance criteria

- AC-1 — Live generated text reaches the browser promptly in bounded incremental
  updates, with no unconditional one-second delay while a turn is active. Idle
  subscriptions remain bounded; access revalidation, stream capacity, replay
  cursor, expiry and disconnected-subscriber cleanup remain enforced.
- AC-2 — AI SDK UI consumes valid incremental message/text lifecycle parts from
  durable canonical events. Snapshot/reconnect/replay reconcile history without
  duplicates or regressing text; canonical tool/material/usage projections remain
  safe. No whole-message reset on every ordinary live text event.
- AC-3 — Localized visible animated activity covers admission/queue, waiting for
  first text and tool work; writing indication remains during active generation.
  Empty streaming placeholders never hide all activity. Stop/error/completion
  terminate indicators. Reduced-motion and screen-reader behavior are explicit.
- AC-4 — Streamdown renders incomplete/streaming Markdown with restrained text
  reveal/caret behavior and stable final output. Preserve CSS Modules/tokens,
  en/ru/es/fr and RTL support, safe absolute HTTP(S) links, no raw HTML/images,
  no remote assets or unexpected code/diagram execution. Existing attachment and
  Knowledge UI remain intact.
- AC-5 — Focused SDK/transport, polling/security, rendering/activity tests and
  maintained real browser/disposable DB journeys prove progressive output,
  waiting gaps, reconnect, Stop, retry, final content and prior positioning.
  Affected lint/typecheck/build, guides, independent completion/security and
  bounded tester review pass with final-state evidence.

## Scope and constraints

Maintain ADR0037 durable admission/replay architecture: Mastra remains in the
worker, canonical persistence and accounting/authorization fences authoritative.
SDK projection is presentation only. Disconnect never cancels generation; only
explicit application Stop does. Do not expose raw reasoning, tool inputs or memory.
Do not replace durable endpoints with a direct model route. Evaluate official
Mastra converter compatibility but use it only where it fits safe public events.
No database schema, provider policy, paid calls or remote deployment planned.
Streamdown is an explicitly authorized production UI dependency.

No supplied visual design: preserve current docked shell and compose a small
activity indicator and streaming Markdown using existing tokens/primitives.

## User-flow documentation

Update existing contextual-language-assistant-and-knowledge guide and mapped
backend/web tests; streaming is a refinement of that journey, so a duplicate guide
would fragment its source-of-truth. Add stable streaming scenarios there if needed.

## Completion

AC-1–AC-5 verified against final source state. EVIDENCE.md records scoped checks,
real-app proof and limits; REVIEW.md, TEST-REVIEW.md and SECURITY-REVIEW.md pass.
No open material findings. Required local feature commit/squash merge follows
root Git policy; no remote push or deployment is included.
