# Knowledge Markdown insertion

Status: Complete
Created: 2026-10-20

## Authorization and scope

User accepted the source-backed [survey](../../../docs/surveys/chat-markdown-to-knowledge-editor.md) and explicitly requested its mappings and official @tiptap/markdown integration. This extends the already authorized Knowledge rich-editor transfer scope; production dependency requires feature delivery. Preserve JSON schema/storage, private drafts, explicit Save and ADR-0042 target/undo behavior. No migrations or model changes.

## Acceptance criteria

- MD-1: Insert/Append/Replace interpret completed chat Markdown into editable headings, paragraphs, marks, lists, quotes and supported tables, including the supplied French example. Heading mapping H1→H2, H2/H3 unchanged, H4–H6→H3 is visible when applicable.
- MD-2: Preflight unsupported input, embedded HTML, unsafe links and document bounds before mutation. Report failures and offer an explicit plain-text alternative without silently dropping content. Preserve existing text and references.
- MD-3: Preview reflects formatted content; a single phrase fits inline. Existing target mapping/conflict comparison, one undoable acceptance and draft-only mutation remain intact.
- MD-4: Rich content survives recovery, Save and reload and existing copy/share rendering; focused tests, real browser journey, affected static checks and independent correctness/security review pass.

## Exclusions

No new document nodes/schema, Markdown storage, media/RAG, automatic reinterpretation of saved notes or ordinary paste, paid model calls or remote conversion. Existing literal Markdown remains unchanged unless explicitly reused.
