import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKnowledgeSentenceApi } from '@/fsd/widgets/knowledge-vocabulary/api/knowledge-sentence-api';
import { SentenceApiError } from '@/fsd/features/sentence-training';
const noteId = '00000000-0000-4000-8000-000000000001';
const blockId = '00000000-0000-4000-8000-000000000002';
const access = {
    kind: 'note' as const,
    locator: 'a'.repeat(32),
    key: 'b'.repeat(43),
};
const make = () =>
    createKnowledgeSentenceApi({
        noteId,
        blockId,
        access,
        requestWithSession: (request) => request('learner-token'),
    });
afterEach(() => vi.unstubAllGlobals());
describe('note sentence transport uses existing private practice contract', () => {
    it('sends real source-bound next operation with shared proof and never creates a dictionary', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    kind: 'empty',
                    reason: 'review-exhausted',
                }),
            ),
        );
        vi.stubGlobal('fetch', fetch);
        const input = {
            operationId: noteId,
            sessionId: blockId,
            direction: 'source-to-target' as const,
            mode: 'review-only' as const,
            scope: { type: 'all' as const },
            visitedExerciseIds: [],
        };
        expect(await make().next(input)).toEqual({
            kind: 'empty',
            reason: 'review-exhausted',
        });
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).toContain(
            `/knowledge/${noteId}/vocabulary/${blockId}/sentences/next`,
        );
        expect(url).not.toContain(access.key);
        expect(JSON.parse(options.body)).toEqual(input);
        expect(options.headers).toMatchObject({
            Authorization: 'Bearer learner-token',
            'X-Languon-Share-Key': access.key,
        });
    });
    it('does not expose unsupported batch preparation as pretend successful methods', () => {
        const api = make();
        expect(api.startPreparation).toBeUndefined();
        expect(api.preparedBatch).toBeUndefined();
    });
    it('preserves canonical access-loss error for source revocation', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: 'source_not_found',
                            message: 'Unavailable',
                            correlationId: 'synthetic',
                        },
                    }),
                    { status: 404 },
                ),
            ),
        );
        const error = await make()
            .progress('source-to-target')
            .catch((error) => error);
        expect(error).toBeInstanceOf(SentenceApiError);
        expect(error.code).toBe('source_not_found');
    });
});
