import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKnowledgeFlashcardApi } from '@/fsd/widgets/knowledge-vocabulary/api/knowledge-flashcard-api';
import { FlashcardApiError } from '@/fsd/features/flashcard-training';
const noteId = '00000000-0000-4000-8000-000000000001';
const blockId = '00000000-0000-4000-8000-000000000002';
const access = {
    kind: 'workbook' as const,
    locator: 'a'.repeat(32),
    key: 'b'.repeat(43),
};
const make = () =>
    createKnowledgeFlashcardApi({
        noteId,
        blockId,
        access,
        requestWithSession: (request) => request('private-token'),
    });
afterEach(() => vi.unstubAllGlobals());
describe('direct note flashcard transport', () => {
    it('reuses private progress without saving a dictionary and keeps share authority in headers', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    total: 2,
                    known: 1,
                    again: 0,
                    unstudied: 1,
                }),
            ),
        );
        vi.stubGlobal('fetch', fetch);
        expect(await make().getProgress()).toEqual({
            total: 2,
            known: 1,
            again: 0,
            unstudied: 1,
        });
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).toContain(
            `/knowledge/${noteId}/vocabulary/${blockId}/learning/progress`,
        );
        expect(url).not.toContain(access.key);
        expect(url).not.toContain('dictionary');
        expect(options.headers).toMatchObject({
            Authorization: 'Bearer private-token',
            'X-Languon-Share-Key': access.key,
            'X-Languon-Share-Locator': access.locator,
            'X-Languon-Share-Kind': 'workbook',
        });
        expect(options.cache).toBe('no-store');
    });
    it('uses canonical access-loss errors so existing session clears material after revocation', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: 'source_not_found',
                            message: 'Unavailable',
                            correlationId: 'test',
                        },
                    }),
                    { status: 404 },
                ),
            ),
        );
        const error = await make()
            .getProgress()
            .catch((error) => error);
        expect(error).toBeInstanceOf(FlashcardApiError);
        expect(error.code).toBe('source_not_found');
    });
    it('retries the same attempt operation unchanged instead of silently generating another identity', async () => {
        const operationId = '00000000-0000-4000-8000-000000000003';
        const fetch = vi
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        attemptId: operationId,
                        entryId: blockId,
                        learningVersion: 1,
                        rating: 'known',
                    }),
                ),
            );
        vi.stubGlobal('fetch', fetch);
        const api = make();
        const input = {
            operationId,
            sessionId: noteId,
            entryId: blockId,
            expectedLearningVersion: 1,
            round: 1,
            rating: 'known' as const,
            configuration: {
                front: ['source' as const],
                back: ['translation' as const],
            },
        };
        await expect(api.rate(input)).rejects.toBeInstanceOf(FlashcardApiError);
        await api.rate(input);
        expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
    });
});
