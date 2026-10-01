import { describe, expect, it, vi } from 'vitest';
import {
    buildAiValue,
    shouldAcceptAuthoringProposal,
} from '@/fsd/widgets/dictionary-editor/ui/editor-card-sheet/editor-card-sheet';
import { DictionaryApiError } from '@/fsd/entities/dictionary';
import { CardAutoSaveError } from '@/fsd/widgets/dictionary-editor/lib/card-auto-save';
import { cardSaveFeedback } from '@/fsd/widgets/dictionary-editor/lib/card-save-feedback';

type Model = Parameters<typeof buildAiValue>[0];

function model(
    currentJob: { id: string; state: string },
    reviewId: string | null,
): Model {
    return {
        t: (key: string) => key,
        authoringJob: {
            data: { ...currentJob, format: 'card-authoring:v3' },
            error: null,
        },
        authoringReviewJob: reviewId
            ? {
                  id: reviewId,
                  format: 'card-authoring:v3',
                  state: 'review',
                  proposal: { id: `proposal-${reviewId}`, suggestions: [] },
              }
            : null,
        cardAuthoringAction: { error: null, isPending: false },
        generationCapabilities: {
            data: { cardAuthoringGeneration: { available: true } },
        },
    } as unknown as Model;
}

describe('editor proposal ownership during polling', () => {
    it('offers explicit reload for a changed accepted revision rather than claiming refresh failed', () => {
        const cause = new DictionaryApiError(409, {
            code: 'version_conflict',
            correlationId: 'test',
            message: 'Changed',
        });
        const feedback = cardSaveFeedback(
            new CardAutoSaveError(cause, true, true),
            (key) => key,
        );
        expect(feedback.conflict).toBe(true);
        expect(feedback.message).not.toBe(
            'dictionary.card.ai.savedRefreshFailed',
        );
    });
    it('accepts AI provenance when manually saving a corrected latest existing-card generation', () => {
        expect(shouldAcceptAuthoringProposal(true, 1, false, true)).toBe(true);
        expect(shouldAcceptAuthoringProposal(false, 1, false, true)).toBe(true);
    });

    it('does not reuse accepted provenance when restoring saved historical versions', () => {
        expect(shouldAcceptAuthoringProposal(true, 1, false, false)).toBe(
            false,
        );
        expect(shouldAcceptAuthoringProposal(true, 0, false, false)).toBe(
            false,
        );
        expect(shouldAcceptAuthoringProposal(false, 1, true, true)).toBe(true);
    });
    it('does not relabel the retained proposal with the just-completed successor job ID', () => {
        const ai = buildAiValue(
            model({ id: 'new-job', state: 'review' }, 'prior-job'),
            vi.fn(),
        );
        expect(ai?.job?.id).toBe('new-job');
        expect(ai?.proposalJobId).toBe('prior-job');
        expect(ai?.proposal).toMatchObject({ id: 'proposal-prior-job' });
    });

    it('updates ownership only once the successor review is retained', () => {
        const ai = buildAiValue(
            model({ id: 'new-job', state: 'review' }, 'new-job'),
            vi.fn(),
        );
        expect(ai?.proposalJobId).toBe('new-job');
        expect(ai?.proposal).toMatchObject({ id: 'proposal-new-job' });
    });

    it('keeps running, failed and cancelled successors distinct from retained review', () => {
        for (const state of ['running', 'failed', 'cancelled']) {
            const ai = buildAiValue(
                model({ id: 'new-job', state }, 'prior-job'),
                vi.fn(),
            );
            expect(ai?.job?.state).toBe(state);
            expect(ai?.proposalJobId).toBe('prior-job');
            expect(ai?.successorActive).toBe(state === 'running');
        }
    });

    it('does not invent ownership when no review proposal has arrived', () => {
        const ai = buildAiValue(
            model({ id: 'new-job', state: 'review' }, null),
            vi.fn(),
        );
        expect(ai).not.toHaveProperty('proposalJobId');
        expect(ai?.proposal).toBeNull();
    });
});
