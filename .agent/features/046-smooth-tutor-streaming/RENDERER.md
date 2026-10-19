# Streaming Markdown renderer evidence

2026-10-19. Base e83bc49, feature/smooth-tutor-streaming, uncommitted renderer scope.

## Decisions

- Streamdown 2.7.1, installed by the root agent. Its streaming mode repairs
  unfinished emphasis and suppresses unfinished link destinations. Completed
  messages use static mode with incomplete repair disabled, preserving final text.
- Explicit `rehypePlugins=[]` removes the default raw-HTML parser entirely;
  `skipHtml`, narrow allowed elements and `safeChatLink` remain. Anchors independently
  recheck absolute HTTP(S) URLs, with noopener/noreferrer and a new tab.
- Every allowed tag has a plain semantic renderer override. No built-in controls,
  link modal, syntax-highlighter, math, Mermaid, image or external-asset plugins.
  Streamdown CSS is not imported. Existing typography, tokens and CSS Modules own
  the appearance; package streaming direction wrappers use display:contents.
- Word fade uses duration120ms/stagger12ms/backlog120ms with a local keyframe.
  Only generated animation spans expand the prior allowlist. Raw HTML is never
  parsed, so untrusted span styles cannot enter this tree. Reduced-motion media
  query disables animation entirely. The root agent owns bounded text reveal and
  explicit writing activity, avoiding a second blinking caret.
- Root exposes `data-assistant-content`; public props are content and optional
  streaming (defaultfalse). Existing current attachment/Knowledge rendering stays
  outside this renderer.

Official configuration reference inspected:
https://streamdown.ai/docs/configuration; installed package types/dist inspected
for actual2.7.1 semantics and generated animation properties.

## Checks

- Red: `pnpm --filter @languon/web exec vitest run tests/chat-markdown.test.tsx`
  before replacement: 2 failed/3passed. Old renderer exposed unclosed emphasis
  and linked the partial destination of an unfinished Markdown link.
- Green: same command after final changes: 7passed. Tests cover unfinished
  emphasis/link completion; exact final output; streaming-only generated spans;
  semantic tables/lists and inert Mermaid code; safe URL isolation; no mounted
  rawHTML/script/style/image/SVG/embed both streaming and static.
- `pnpm exec eslint apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/chat-markdown.tsx apps/web/tests/chat-markdown.test.tsx`: pass.
- `pnpm --filter @languon/web typecheck`: pass (final session2186).
- Prettier targeted renderer TSX/CSS/test: pass.
- `pnpm --filter @languon/web styles:check` initially failed on concurrent
  durable-message-projection.ts protocol literals text-start/text-delta/text-end,
  unrelated to renderer CSS; communicated to root for narrow checker remediation.

Actual browser animation/reduced-motion/RTL/network proof is root-owned integrated
verification; these unit checks do not claim browser CSS evidence.

## Tested content hashes (SHA256)

```text
e9a52f51d541157edb899c9aec5c36cd115e40328f5cc9b2e430362d9d47c6a9  apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/chat-markdown.tsx
7ca1848513809eaed109e20d622ece8d0c9eface9d74e4c42b86d90ea73c360b  apps/web/src/fsd/widgets/contextual-assistant/ui/contextual-assistant/chat-markdown.module.css
86941c8451cf74bedac47f97d91de869f8efcd3c33cade299e3084e19de54ffc  apps/web/tests/chat-markdown.test.tsx
```
