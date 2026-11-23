# Review and reuse generated lesson blocks

The owner of a Knowledge note can preview prepared lesson material and copy a completed lesson into its editable draft. Based on Feature071 and the user-approved extension to completed lesson insertion.

- AC-1. Review lives in the workspace AI panel. The read-only Knowledge editor shows each complete or prepared task as a logical part. Exercise hints and correct answers are initially hidden and have separate explicit disclosure actions.
- AC-2. The owner can insert a whole reading, grammar explanation or exercise set at the current document cursor or at the end. Each control names its destination. Bulk insertion adds missing parts in lesson order. Saving stays explicit.
- AC-3. A part already in the current draft is identified and cannot be inserted again. Removing the part makes insertion available. Replaying the same operation remains idempotent.
- AC-4. Only the task currently being authored shows a rotating spinner and moving text highlight. Reduced-motion preferences keep the task readable with a static indicator.
- AC-5. Owner, branch, revision, document bounds and source/media permissions apply to each copy. Existing proposal application retains its existing semantics for other generated content.
