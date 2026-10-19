# Contextual Language Assistant and Knowledge

Status: Complete
Classification: explicitly authorized feature implementation (2026-10-19).
Backlog: [BL-006](../../../docs/backlog/006-grammar-conversations-and-learning-documents.md), first delivery only; exercises and guided tutoring remain deferred.
Design: [ADR-0037](../../../docs/adr/0037-independent-knowledge-and-agent-proposals.md), [domain context](../../../CONTEXT.md).

## Outcome

Signed-in learners discuss their dictionaries, texts and independent Knowledge notes with a language tutor, and explicitly save editable explanations to their private Knowledge library. The existing web application, model preferences, credits, source permissions and durable worker execution remain authoritative.

## Scope and acceptance criteria

- AC01: Owned and currently accessible shared dictionaries/texts and owned notes open private source-associated conversations. Reopen most recent, choose history, start new and delete conversation. No cross-conversation memory.
- AC02: Initial dictionary metadata, current saved text/translation or note are available. Bounded current-source retrieval shows material used; selected cards/passages focus the question. Multiple card attachments copy every active learner-visible field, with typed visible markup. Other sources require explicit authorized copied attachment.
- AC03: New turns use latest saved source and show changes; admitted context is frozen. Unsaved changes require Use current draft. Earlier wording survives edits. Copied attachments create no live dependency.
- AC04: Primary archive/access loss hides conversations, drafts and memory; restoration restores access. Permanent primary deletion removes associated conversations. Saved notes and independently authorized copied attachments survive originating-source deletion.
- AC05: Stream responses durably. Closing/navigating preserves running work; reopening reconnects. One active response, idempotent admission/reconnect, explicit Stop and Retry, failed partials labeled incomplete and learner messages retained. No automatic redispatch after ambiguous provider crash.
- AC06: Tutor supports language-learning explanations, nuances, rewrites and culture, redirects unrelated tasks, acknowledges uncertainty, fabricates no references and claims no exhaustive analysis of excerpts. No external web search or verified label.
- AC07: Conversation preferences: Auto/chosen reply language, neutral/conversational/academic tone, Auto/beginner-friendly/detailed level. Model infers language from actual question, preserving previous for ambiguous replies. Profile defaults and explicit Use as my defaults affect future conversations only.
- AC08: Knowledge content contains title, short summary, restricted formatted explanation, multiple fixed categories, studied language and explanation language; no originating source/conversation links. Search/filter by category/studied language, recently updated first. Editable and deletable.
- AC09: AI proposes structured new/revision drafts; learner edits and explicitly saves. Drafts persist privately under conversations, excluded from library. Discard/chat deletion removes draft only. Manual edits/save require no AI usage. Ask about note leaves saved content unchanged.
- AC10: Optimistic versions prevent overwrite. Stale draft is retained with compare/new-note paths. Revision history and restore create new revisions. Confirmed deletion removes note/revisions; pending drafts cannot recreate deleted targets implicitly.
- AC11: Selected model and usage are visible; chat Auto resolves to DeepSeek Flash only. Explicit incompatible/unavailable models error without fallback. Existing other task behavior unchanged. Every actor/observer/reflector provider call is bounded and credit-accounted; cancellation preserves incurred usage.
- AC12: Pinned Mastra observational memory is conversation scoped, synchronous inside bounded turns, preserves readable canonical history and genuine tool exchanges, and uses explicitly selected model. No speculative background processing. Lease/access fences prevent late writes.
- AC13: Knowledge application service enforces ownership/revisions outside prompts. Tools read authorized context and propose structured drafts, never silently publish/update/delete. Future tutors can reuse capabilities. Untrusted source text cannot override authorization or tool scope.
- AC14: Responsive web uses desktop panel and narrow fullscreen view, Knowledge navigation and profile defaults, accessible controls and safe Markdown/Tiptap rendering; en/ru/es/fr UI and RTL learning material supported.
- AC15: Disposable database/cache, deterministic model integration, browser and mapped E2E verification cover permissions, concurrency, credits, revisions, deletion and reconnect. Independent completion/security reviews and concurrency tester findings resolved before completion.

## Approved technical choices

- Vercel AI SDK UI (`ai`7.0.143 / `@ai-sdk/react`4.0.147) with custom durable transport for streaming and typed tool states. SDK client abort only disconnects; application Stop cancels work.
- Tiptap 3.32.0 visual editor, versioned restricted ProseMirror JSON and server-derived plain-text search projection. No images, arbitrary HTML, embeds or executable content. Chat Markdown is separate.
- @mastra/core existing 1.57.0 plus @mastra/memory 1.26.0, app-owned transactional MemoryStorage adapter. No @mastra/pg runtime schema creation.
- DeepSeek Flash is initial supported chat model; Auto exception is limited to chat. Native server-side tools, no fabricated historical tool results.
- Five provider calls per turn maximum, at most two memory calls, reserve actor capacity; existing tighter token/time/capacity/credit bounds apply. Terminal replay events retained 24 hours, canonical messages remain.

## Exclusions

Native mobile, standalone sourceless chats, course tutor, exercises, custom categories/folders, external browsing, automatic publication and source links on Knowledge notes are deferred.

## Delivery

Execution: [EXEC_PLAN.md](./EXEC_PLAN.md). Verification: [EVIDENCE.md](./EVIDENCE.md). Review: [REVIEW.md](./REVIEW.md).
User-flow guide required: `docs/user-flows/contextual-language-assistant-and-knowledge.md`; existing dictionary/text/profile guides updated where behavior changes.
