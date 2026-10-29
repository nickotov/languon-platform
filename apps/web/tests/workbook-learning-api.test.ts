import { afterEach, describe, expect, it, vi } from 'vitest';
import { learningApi } from '@/fsd/features/workbook-learning';
const noteId = '11111111-1111-4111-8111-111111111111';
const access = {
    kind: 'workbook' as const,
    locator: 'a'.repeat(32),
    key: 'b'.repeat(43),
};
afterEach(() => vi.unstubAllGlobals());
describe('private learner API authorization', () => {
    it('uses the workbook aggregate endpoint with header-only capability and authenticated identity', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    workbookId: noteId,
                    workbookVersion: 1,
                    totalNotes: 2,
                    completedNotes: 1,
                    updatedSinceCompletion: 0,
                }),
                { status: 200 },
            ),
        );
        vi.stubGlobal('fetch', fetch);
        await learningApi.workbookProgress('session', noteId, access);
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).toMatch(
            new RegExp(`/knowledge/workbooks/${noteId}/progress$`),
        );
        expect(url).not.toContain(access.key);
        expect(options.headers['X-Languon-Share-Key']).toBe(access.key);
        expect(options.headers.Authorization).toBe('Bearer session');
    });
    it('sends shared source grant in headers and rejects client evaluation fields', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    noteId,
                    noteVersion: 1,
                    attempts: [],
                    events: [],
                    completion: null,
                    updatedSinceCompletion: false,
                    exerciseRevisions: [],
                    truncated: false,
                }),
                { status: 200 },
            ),
        );
        vi.stubGlobal('fetch', fetch);
        await learningApi.state('actor-session', noteId, access);
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).not.toContain(access.key);
        expect(options.headers).toMatchObject({
            Authorization: 'Bearer actor-session',
            'X-Languon-Share-Kind': 'workbook',
            'X-Languon-Share-Locator': access.locator,
            'X-Languon-Share-Key': access.key,
        });
        expect(() =>
            learningApi.attempt(
                'actor-session',
                noteId,
                {
                    id: noteId,
                    noteVersion: 1,
                    exerciseId: noteId,
                    exerciseRevision: 'c'.repeat(64),
                    answer: { format: 'free-text', text: 'answer' },
                    evaluation: { status: 'correct' },
                } as never,
                access,
            ),
        ).toThrow();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
