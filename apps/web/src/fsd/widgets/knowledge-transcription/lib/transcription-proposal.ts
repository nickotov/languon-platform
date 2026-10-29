import {
    AssistantLanguageSchema,
    LearningBlockSchema,
    LearningTranscriptSchema,
    type SubmitKnowledgeTranscriptionRequest,
} from '@languon/contracts';
import type { TranscriptionAudioBlock, TranscriptionDraft } from '../types';
export type PreparedTranscription = {
    input: SubmitKnowledgeTranscriptionRequest;
    expected: TranscriptionAudioBlock & { assetId: string };
    branchId: string;
    branchVersion: number;
    noteId: string;
};
/** Preserve the exact source block and working branch seen before a potentially long operation. */
export function captureTranscription(
    noteId: string,
    draft: TranscriptionDraft,
    blockId: string,
    language: string,
): PreparedTranscription {
    const found = draft.blocks.find(
        (block) => block.id === blockId && block.type === 'audio',
    );
    if (!found) throw new Error('The selected audio block is unavailable.');
    const target = LearningBlockSchema.parse(found);
    if (target.type !== 'audio') throw new Error('An audio block is required.');
    if (!target.assetId)
        throw new Error('Add a recording before requesting a transcription.');
    return {
        noteId,
        branchId: draft.branchId,
        branchVersion: draft.branchVersion,
        expected: { ...target, assetId: target.assetId },
        input: {
            operationId: crypto.randomUUID(),
            noteId,
            assetId: target.assetId,
            languages: [AssistantLanguageSchema.parse(language)],
        },
    };
}
export function transcriptionReplacement(
    expected: TranscriptionAudioBlock,
    text: string,
    language: string,
): TranscriptionAudioBlock {
    const transcript = LearningTranscriptSchema.parse({
        language: AssistantLanguageSchema.parse(language),
        segments: [{ id: crypto.randomUUID(), text }],
    });
    return { ...expected, transcript };
}
