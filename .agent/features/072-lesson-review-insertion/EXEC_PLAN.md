# Implementation plan

## First implementation (superseded)

These notes describe the former modal implementation. Current behavior and verification are recorded in the workspace-panel revision below.

The existing preview assembled validated checkpoints into a document with a single body renderer. Applying the final proposal consumed its application receipt. Removing a block from the draft left that receipt in place. The task list already distinguished a running unit from queued and completed units.

1. Use the approved native dialog and document renderer for a right-hand desktop sheet and mobile bottom sheet. Wrap each top-level node, keep the document source context for its renderer and expose accessible placement and insertion controls on the final proposal.
2. Keep generation, checkpoint reading and original proposal application intact. Add a copy command restricted to the completed lesson’s published proposal. Resolve selection server-side, validate dependencies, allocate independent identities, and use a new operation ID per explicit insertion. Bind network retries to the original ID.
3. Animate the spinner and foreground of the active row, retaining static states for reduced motion and forced colors.
4. Test ownership, stale branches, repeat/retry behavior, independent identities, real editor insertion at both destinations, Save/reload, and desktop/mobile presentation. Run focused deterministic tests, type checks, the mapped browser journey, database tests, guide and diagram checks. No model dispatch is required for these cases.

The feature branch is based on b5a986e1, the current lesson implementation. Local main does not yet include that prerequisite. Preserve independent working-tree changes.

The four implementation steps are complete. Review found one stale-branch recovery issue. Reconciliation now pauses insertion until the working branch advances and preserves local changes. Older completed lessons can reopen their final proposal by an exact owner-scoped lookup, even when the normal history list omits it. See EVIDENCE.md and REVIEW.md for scope and verification.

## Revised review and placement flow

User feedback supersedes the initial modal and per-document-node selection. Use the existing Knowledge editor in read-only mode, reuse exercise content/disclosure components, and project the latest validated artifact for each task into its published logical part. Keep the owner proposal and editable branch as the only insertion authority. Explicit destination buttons act on one part or all missing parts. Preserve chat state during review, let the owner move the document cursor, and derive availability from the live draft as well as the saved branch. Test long multi-paragraph reading, multi-exercise sets, hidden details, removal, cursor target, stale/replayed requests, ordinary editor behavior, and the narrow-screen workspace.

Review also covers distinguishing intentional reinsertion from a retried network request, source changes between separate insertions, disclosure labels, and hidden chat overlays. Existing unmarked material from the earlier per-node insertion command cannot be reliably attributed after it received fresh IDs. Avoid matching by text because independently authored material can have identical wording.

Completed the revised flow and its targeted verification. The workspace journey, contracts, shared overlay tests, disposable database integration, both production builds, user-flow mappings and diagram checks passed. Earlier per-node copies with randomized IDs remain indistinguishable from independently authored material.
