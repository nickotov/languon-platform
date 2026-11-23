# Listening exercises in Knowledge chat

Status: Implemented and locally verified. Production speech requires the deployment readiness checks in EVIDENCE.md.

Generate a playable, insertable listening set from a topic, passage, or an existing owned audio block.

- AC-1. L01 tests listening for meaning, L04 tests an omitted recorded phrase and L02 checks short dictation locally with word-level feedback. Answer evidence refers to the actual recording.
- AC-2. New recordings support narration or two distinct voices. Reuse a playable source with a suitable transcript without synthesizing it again. Timed excerpts use measured boundaries.
- AC-3. Durable generation bounds combined text and speech spending, survives interruption, reuses completed utterances and respects Stop and ownership.
- AC-4. The read-only Knowledge editor in chat previews the set with a shared player, optional transcript, hints and answers. The complete set inserts at cursor or document end with safe remapping and existing save semantics.
- AC-5. The editor picker, chat picker and Workbook expose listening formats and playable local examples. The use of listening materials in private previews does not record attempts.
