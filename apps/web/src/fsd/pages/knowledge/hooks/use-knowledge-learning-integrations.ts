import { useMemo } from 'react';
import type { LearningBlock, KnowledgeBlockProposal } from '@languon/contracts';
import type {
    KnowledgeBlockCopyContext,
    KnowledgeLibraryContext,
} from '@/fsd/features/knowledge-notes';
import type { KnowledgeTranscriptionProps } from '@/fsd/widgets/knowledge-transcription';
import { uploadKnowledgeAudio } from '@/fsd/entities/knowledge';
import { useKnowledgeBlockPlayback } from '@/fsd/widgets/knowledge-speech';
import { useSessionStore } from '@/fsd/entities/session';
import { useNoteAudio } from '@/fsd/features/workbook-learning';
import { useOwnedBlockPractice } from './use-owned-block-practice';
import { exerciseSource } from '@/fsd/features/workbook-learning';
import { useAuth } from '@/fsd/features/auth';
import type { useKnowledgePageActions } from './use-knowledge-page-actions';

/** Owner-side content preparation changes the working draft; publication remains explicit. */
export function useKnowledgeLearningIntegrations(
    noteId: string,
    actions: ReturnType<typeof useKnowledgePageActions>,
) {
    const { requestWithSession } = useAuth();
    const { state, workspace, draft } = actions;
    const playback = useKnowledgeBlockPlayback({ noteId, requestWithSession });
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
              getPlayback: (proposal: KnowledgeBlockProposal) =>
                  playback.options(async () => ({
                      origin: {
                          kind: 'proposal',
                          conversationId: proposal.conversationId,
                          proposalId: proposal.id,
                      },
                      blocks: proposal.blocks,
                  })),
          }
        : undefined;
    const library: KnowledgeLibraryContext | undefined = draft
        ? {
              requestWithSession,
              noteId,
              workingSource: {
                  branchId: draft.branchId,
                  expectedVersion: draft.version,
              },
              resolveWorkingSource: async () => {
                  const current = await state.flush();
                  return {
                      branchId: current.branchId,
                      expectedVersion: current.version,
                  };
              },
          }
        : workspace?.published
          ? {
                requestWithSession,
                noteId,
                noteVersion: workspace.published.version,
            }
          : undefined;
    const blocks =
        draft?.content.body.document.content?.flatMap((node) =>
            node.attrs?.block ? [node.attrs.block] : [],
        ) ?? [];
    const actorId = useSessionStore((current) => current.user?.id);
    const audioUrls = useNoteAudio({
        noteId,
        body: draft?.content.body,
        actorId,
        requestWithSession,
        access: undefined,
        unavailable: false,
    });
    const practice = useOwnedBlockPractice(
        noteId,
        workspace?.published,
        blocks,
    );
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
    function blockViewOptions(block: LearningBlock) {
        const source = exerciseSource(block, draft?.content.body);
        return {
            ...practice.options(block),
            ...(block.type === 'audio' && block.assetId
                ? { audioUrl: audioUrls[block.assetId] }
                : {}),
            ...(source.audioAssetId
                ? { audioUrl: audioUrls[source.audioAssetId] }
                : {}),
            ...(source.transcript ? { hintTranscript: source.transcript } : {}),
            ...(source.videoSource
                ? { hintVideoSource: source.videoSource }
                : {}),
            playback: playback.options(async () => {
                const current = await flushNarration();
                return {
                    origin: {
                        kind: 'working',
                        branchId: current.branchId,
                        expectedBranchVersion: current.branchVersion,
                    },
                    blocks: current.blocks.filter(
                        (item) => item.id === block.id,
                    ),
                };
            }),
        };
    }
    const branchId = draft?.branchId;
    const fieldAi = useMemo(
        () => (branchId ? { noteId, branchId, requestWithSession } : undefined),
        [noteId, branchId, requestWithSession],
    );
    return {
        fieldAi,
        blockViewOptions,
        speechConfirmation: playback.confirmation,
        evaluationConsent: practice.consent,
        uploadAudio,
        blockProposalContext,
        library,
        narration,
        transcription,
        blockCopy,
    };
}
