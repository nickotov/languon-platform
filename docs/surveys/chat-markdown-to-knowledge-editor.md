---
type: survey
title: Chat Markdown insertion into the Knowledge editor
research_date: 2026-10-20
source_paths:
    - apps/web/src/fsd/features/knowledge-notes/hooks/use-knowledge-editor-handle.ts
    - apps/web/src/fsd/features/knowledge-notes/ui/knowledge-editor/knowledge-editor.tsx
    - apps/web/src/fsd/features/knowledge-notes/lib/editor-document.ts
    - packages/contracts/src/contextual-assistant.ts
---

# Chat Markdown insertion into the Knowledge editor

## Recommendation

Parse accepted assistant Markdown into validated Tiptap JSON before insertion.
Keep JSON as the stored document format and keep Streamdown for displaying chat.
Use the official `@tiptap/markdown` package, subject to a bounded compatibility
check against the installed Tiptap 3.32.0 packages. This is a proposal; no runtime
dependency or application behavior was changed during this research.

Tiptap documents Markdown parsing and serialization through its official
extension, currently labelled **beta**. Its documented limitations include
comments and multiple block children in Markdown table cells. Pin the integration
and test representative replies rather than assuming complete equivalence with
the chat renderer. [Official introduction](https://tiptap.dev/docs/editor/markdown).

## Verified cause and existing constraints

The bug is in
[`applyProposal`](../../apps/web/src/fsd/features/knowledge-notes/hooks/use-knowledge-editor-handle.ts):
it splits the answer on every newline and puts each line in a paragraph's text
node. Thus `## Heading` and `**bold**` are deliberately inserted as literal text.
Empty source lines also become empty editor paragraphs. The caller in
[`use-knowledge-page-actions.ts`](../../apps/web/src/fsd/pages/knowledge/hooks/use-knowledge-page-actions.ts)
passes the proposal text through unchanged.

The [editor configuration](../../apps/web/src/fsd/features/knowledge-notes/ui/knowledge-editor/knowledge-editor.tsx)
uses StarterKit and TableKit, with H2/H3 headings; code blocks and horizontal rules
are disabled. There is no Markdown extension in the web app's dependencies.
The [persisted contract](../../packages/contracts/src/contextual-assistant.ts)
permits paragraphs, H2/H3, lists, blockquotes, tables, hard breaks, text, and marks
for bold, italic, strike, underline, inline code, and links. Links must be absolute
HTTP(S) URLs without credentials. Tables are limited to 20 rows by 8 columns.

Therefore, enabling a parser alone is insufficient: the user's `#` example
produces an H1 that the current storage contract does not accept.

## Accepted implementation mapping

The user accepted this integration after the research. Delivery is tracked in
[feature 049](../../.agent/features/049-knowledge-markdown-insertion/FEATURE.md).
The adapter's explicit mapping is:

| Markdown input                                                            | Document result / acceptance policy                                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Ordinary paragraphs and soft newlines                                     | Paragraphs using Markdown paragraph rules; soft newlines remain text.                                                   |
| `#`, `##`, `###`, `####`–`######`                                         | H2, H2, H3, H3 respectively; a notice reports changed levels.                                                           |
| Bold, italic, strike, inline code                                         | Corresponding marks; code combined with other marks requires literal fallback because the stored schema forbids it.     |
| Bullet/ordered lists, nested items                                        | List nodes; ordered start is preserved within document bounds.                                                          |
| Blockquotes, explicit hard breaks                                         | Blockquote and hardBreak nodes.                                                                                         |
| Absolute HTTP(S) links and reference links                                | Validated link marks without credentials; unsafe/relative links require literal fallback.                               |
| Link tooltip titles                                                       | Visible label and URL retained; tooltip removed with a formatting notice.                                               |
| Rectangular GFM tables                                                    | Editable tables up to 20 total rows including header, 8 columns; ragged rows rejected before parser padding/truncation. |
| Explicit table alignment                                                  | Default document alignment with a formatting notice; all cell text retained.                                            |
| Fenced/indented code blocks, rules, images, task lists, embedded HTML     | Formatted insertion rejected; explicit plain-text option retains source.                                                |
| Empty headings, list items or link labels (including whitespace entities) | Formatted insertion rejected; literal fallback preserves otherwise invisible source.                                    |
| Escaped syntax, entities, ordinary math notation                          | Literal text with normal Markdown entity/escape handling; no formula rendering or execution.                            |
| Oversized input, excessive complexity or invalid Unicode                  | Atomic rejection; shorten input. No truncation.                                                                         |

Both formatted and explicit plain-text insertion validate the complete proposed
document before dispatch. The source limit is 80,000 UTF-16 code units; the saved
document independently enforces its existing text, depth, node, mark and table
limits. Existing saved literal Markdown is never automatically reinterpreted. Reference-definition syntax follows standard Markdown metadata resolution; the original source remains in chat, while supported link destinations become document marks. The document is not a lossless Markdown source archive.

## Options

| Approach                             | Fit and tradeoff                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Official Tiptap Markdown → JSON      | Recommended: integrates with Tiptap extensions; still needs explicit schema adaptation and beta regression coverage.                |
| Custom Markdown AST → Knowledge JSON | Viable fallback if the official parser fails the compatibility check; app must maintain node/mark mappings and edge cases.          |
| Markdown → HTML → editor             | Adds an intermediate HTML interpretation and security surface; offers no clear benefit for the existing JSON contract.              |
| Persist documents as Markdown        | Broad document-format change; requires revisiting recovery, rendering, sharing and schema validation. Unnecessary to fix insertion. |

The official manager exposes `parse(markdown)` returning a Tiptap document.
This enables inspection and validation before mutation.
[MarkdownManager API](https://tiptap.dev/docs/editor/markdown/api/markdown-manager).
Direct `insertContentAt(range, markdown, { contentType: 'markdown' })` is also
documented, but an explicit parse/validate stage better fits this app's restrictive
contract. [Editor API](https://tiptap.dev/docs/editor/markdown/api/editor).

## Proposed integration

```text
Accepted reply Markdown
  → Markdown parser with explicit handlers
  → supported-node normalization + warnings
  → validate prospective complete Knowledge document
  → insert at tracked target in one undoable transaction
  → existing private draft recovery
  → explicit Save publishes rich JSON
```

1. Add a focused conversion adapter owned by the Knowledge editing feature.
   Use a version compatible with the existing Tiptap packages; verify exact
   package availability and peer requirements before installing. The official
   installation uses `@tiptap/markdown` and exposes `editor.markdown.parse()`.
   [Installation](https://tiptap.dev/docs/editor/markdown/getting-started/installation).
2. Preserve paragraphs, bold/italic/strike, inline code, safe links, lists,
   blockquotes, and tables within existing limits. Apply Markdown paragraph rules
   instead of interpreting each source newline as a paragraph.
3. Proposed initial heading policy: map H1 to H2, preserve H2/H3, and map H4–H6
   to H3. Show a compact warning when hierarchy changes. Keep the reply's heading
   in the body; do not rename the note. Exact H1–H6 preservation would require
   extending the persisted schema and all consuming renderers instead.
4. Unsupported blocks must not silently disappear. Initially reject formatted
   insertion containing code blocks, media, task lists, math or horizontal rules,
   explain the unsupported constructs, and offer explicit plain-text insertion.
   This keeps existing document capabilities bounded. A later feature may add
   those node types deliberately.
5. Treat embedded HTML as literal text or reject it; do not execute or directly
   render it. Validate parsed links independently: toolbar URL checks do not
   establish safety of programmatically inserted JSON. Reject unsafe URLs with
   an explanation. Parser handlers must detect unsupported input before any
   lossy fallback. Tiptap documents custom token handlers and HTML fallback through
   extension parsing. [Custom parsing](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-parsing).
6. Construct and validate the prospective whole document before dispatch, including
   existing text, nesting, table and size limits. The current normalization helper
   can inform canonicalization, but must not be relied on to report constructs
   already discarded by a parser. On failure leave the document unchanged.
7. Preserve [ADR-0042](../adr/0042-knowledge-workspace-document-and-context-boundaries.md):
   original tracked target, comparison on target changes, current-end append,
   explicit acceptance, one-step undo and no implicit publication. Define inline
   replacement fitting so a single formatted phrase does not unnecessarily split
   its surrounding paragraph; multi-block insertion must preserve surrounding text.
8. Use the same converted fragment for formatted proposal preview and acceptance.
   Keep the original reply in private chat. Avoid rewriting existing saved prose
   automatically: literal Markdown may be intentional. An explicit convert-selection
   action or paste-as-Markdown option can be considered separately.

Streamdown remains useful for streamed chat rendering. Its rendered DOM should
not become the import source: insertion should consume the original completed
reply and produce document nodes deterministically. This proposal requires no
Mastra change or additional model call and no external conversion service.

## Verification before delivery

- Parse the supplied French example: real heading and bold marks, sensible
  paragraph spacing, no visible formatting delimiters.
- Cover nested lists, links, inline code, blockquotes, tables, escaped literal
  punctuation, Unicode, and unsupported/unsafe inputs without content loss.
- Verify H1 adaptation, table/size/depth boundaries and atomic rejection.
- Exercise insert/append/replace inside paragraphs and lists, original-target
  mapping through edits, conflict comparison and one-step undo/redo.
- Save, reload, recover draft, copy, and inspect the shared saved note: rich
  formatting survives; private conversation data stays private.
- Verify desktop/mobile in the running app and measure large-reply conversion.

This research establishes the code cause and documented APIs. Parser behavior
against the exact installed version, full schema fidelity, bundle impact and
browser results remain unmeasured; the implementation check should decide these
before committing to the adapter.
