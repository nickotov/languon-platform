---
type: backlog-task
id: BL-006
title: 'Grammar conversations and learning documents'
status: pending
created: 2026-10-01
updated: 2026-10-02
original_tasks: '9'
evidence: []
---

# BL-006 — Grammar conversations and learning documents

[Backlog index and shared constraints](README.md).

## Confirmed requirements

- Provide a personal grammar workspace with selected source and target languages,
  grammar questions, and conversational clarification.
- The learner decides when to click Summarise. AI creates a saved grammar
  document with the explanation and compact summary of the learner's messages
  to provide context for future interactions.
- Returning to the document supports follow-up conversation and exercise generation.
  The learner may summarise again to update the document.
- Generate exercises on demand from the documented rules, and save the generated
  content attached to the grammar document for reuse.
- Keep learner attempts and progress separate from exercise content.
- Grammar conversations, documents, and exercises are private in the first version.

## Existing behaviour and implementation context

The [product overview](../project-description-short.md) describes a grammar expert as
future product direction; it is not evidence that this complete journey exists.
Dictionary ownership does not make a grammar document a dictionary entry, and
saved grammar content needs its own appropriate domain representation.

## Resolve before implementation

Language roles and explanation language, conversation/document relationship,
summary update/history behaviour, context retention, exercise formats, manual
document editing, and how existing exercises respond to updated rules. Also define
long/failed conversations, retry behaviour, safe document rendering, deletion,
and AI usage charging. Private grammar is confirmed; sharing is a separate future
scope rather than an implied consequence of dictionary sharing.

## Acceptance scenarios to refine

Ask and clarify a question; summarise into a saved document; return with compact
context; continue and summarise again; generate reusable attached exercises;
save personal attempts; verify privacy and recover from generation failure.
