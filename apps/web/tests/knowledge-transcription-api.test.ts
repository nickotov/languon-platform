import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    KnowledgeTranscriptionJob,
    SubmitKnowledgeTranscriptionRequest,
} from '@languon/contracts';
import { transcriptionApi } from '@/fsd/widgets/knowledge-transcription/api/transcription-api';
const noteId = '11111111-1111-4111-8111-111111111111',
    assetId = '22222222-2222-4222-8222-222222222222',
    operationId = '33333333-3333-4333-8333-333333333333';
const job: KnowledgeTranscriptionJob = {
    id: operationId,
    noteId,
    assetId,
    state: 'confirmation-required',
    maximumCredits: '4.321',
    result: null,
    failureCode: null,
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
};
const input: SubmitKnowledgeTranscriptionRequest = {
    noteId,
    assetId,
    operationId,
    languages: ['en'],
};
afterEach(() => vi.unstubAllGlobals());
describe('transcription browser API boundary', () => {
    it('keeps prepare and explicit confirmation separate while preserving request identity', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(Response.json({ job }))
            .mockResolvedValueOnce(Response.json({ job }));
        vi.stubGlobal('fetch', fetch);
        const api = transcriptionApi(
            (callback) => callback('synthetic-token'),
            assetId,
        );
        const signal = new AbortController().signal;
        await api.submit(input, signal);
        await api.submit(
            { ...input, confirmedMaximumCredits: job.maximumCredits },
            signal,
        );
        expect(fetch.mock.calls[0]![0]).toContain(
            `/knowledge/${noteId}/transcriptions`,
        );
        expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual(
            input,
        );
        expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({
            ...input,
            confirmedMaximumCredits: '4.321',
        });
        expect(fetch.mock.calls[0]![1]!.cache).toBe('no-store');
    });
    it('rejects a response belonging to another asset or a completed response without a result', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    job: {
                        ...job,
                        assetId: '44444444-4444-4444-8444-444444444444',
                    },
                }),
            )
            .mockResolvedValueOnce(
                Response.json({ job: { ...job, state: 'completed' } }),
            );
        vi.stubGlobal('fetch', fetch);
        const api = transcriptionApi(
            (callback) => callback('synthetic-token'),
            assetId,
        );
        await expect(
            api.read(noteId, operationId, new AbortController().signal),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            api.read(noteId, operationId, new AbortController().signal),
        ).rejects.toMatchObject({ status: 400 });
    });
    it('does not retry an unavailable provider or expose the raw response body', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(
                new Response('secret upstream data', { status: 503 }),
            );
        vi.stubGlobal('fetch', fetch);
        const api = transcriptionApi(
            (callback) => callback('synthetic-token'),
            assetId,
        );
        await expect(
            api.submit(input, new AbortController().signal),
        ).rejects.toMatchObject({
            status: 503,
            message: 'Transcription is unavailable.',
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
