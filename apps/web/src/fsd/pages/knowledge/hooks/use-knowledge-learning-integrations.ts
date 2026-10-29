import type { LearningBlock } from '@languon/contracts';
import type { KnowledgeBlockCopyContext } from '@/fsd/features/knowledge-notes';
import type { KnowledgeTranscriptionProps } from '@/fsd/widgets/knowledge-transcription';
import { uploadKnowledgeAudio } from '@/fsd/entities/knowledge';
import { useAuth } from '@/fsd/features/auth';
import type { useKnowledgePageActions } from './use-knowledge-page-actions';

/** Owner-side content preparation changes the working draft; publication remains explicit. */
export function useKnowledgeLearningIntegrations(
    noteId: string,
    actions: ReturnType<typeof useKnowledgePageActions>,
) {
    const { requestWithSession } = useAuth();
    const { state, workspace, draft } = actions;
    function uploadAudio(file: File) {
        return requestWithSession((token) =>
            uploadKnowledgeAudio(token, noteId, file),
        );
    }
    async function proposalApplied() {
        await state.reload();
    }
    const blockProposalContext = draft
        ? {
              disabled: actions.busy !== null,
              branchId: draft.branchId,
              branchVersion: draft.version,
              beforeApply: state.flush,
              onApplied: proposalApplied,
              onApplyingChange: actions.setProposalApplying,
          }
        : undefined;
    const library = {
        requestWithSession,
        noteId,
        noteVersion: workspace?.published?.version ?? 0,
    };
    const blocks =
        draft?.content.body.document.content?.flatMap((node) =>
            node.attrs?.block ? [node.attrs.block] : [],
        ) ?? [];
    async function flushNarration() {
        const current = await state.flush();
        return {
            branchId: current.branchId,
            branchVersion: current.version,
            blocks:
                current.content.body.document.content?.flatMap((node) =>
                    node.attrs?.block ? [node.attrs.block] : [],
                ) ?? [],
        };
    }
    function applyNarration(block: LearningBlock) {
        if (!actions.editor.current?.appendLearningBlock(block))
            throw new Error(
                'The prepared audio could not be added to this document.',
            );
    }
    const narration = {
        noteId,
        blocks,
        requestWithSession,
        flush: flushNarration,
        onApply: applyNarration,
    };
    const applyTranscription: KnowledgeTranscriptionProps['onApply'] = (
        expected,
        replacement,
        source,
    ) => {
        if (
            source.noteId !== noteId ||
            actions.draft?.branchId !== source.branchId
        )
            return 'changed';
        return (
            actions.editor.current?.replaceLearningBlock(
                expected,
                replacement,
            ) ?? 'missing'
        );
    };
    const transcription = {
        noteId,
        blocks,
        language: draft?.content.studiedLanguage ?? '',
        requestWithSession,
        flush: flushNarration,
        onApply: applyTranscription,
    };
    async function copySource() {
        const current = await state.flush();
        return {
            kind: 'owned-working' as const,
            noteId,
            branchId: current.branchId,
            expectedVersion: current.version,
        };
    }
    async function beforeCopyApply(destinationNoteId: string) {
        if (destinationNoteId === noteId) await state.flush();
    }
    async function copied(destinationNoteId: string) {
        if (destinationNoteId === noteId) await state.reload();
    }
    const blockCopy: KnowledgeBlockCopyContext | undefined = draft
        ? {
              requestWithSession,
              source: {
                  kind: 'owned-working',
                  noteId,
                  branchId: draft.branchId,
                  expectedVersion: draft.version,
              },
              beforeCopy: copySource,
              beforeApply: beforeCopyApply,
              onApplied: copied,
              onApplyingChange: actions.setProposalApplying,
          }
        : undefined;
    return {
        uploadAudio,
        blockProposalContext,
        library,
        narration,
        transcription,
        blockCopy,
    };
}
