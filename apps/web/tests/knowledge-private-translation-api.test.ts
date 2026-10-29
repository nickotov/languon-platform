import { afterEach, describe, expect, it, vi } from 'vitest';
import { privateTranslationApi } from '@/fsd/widgets/knowledge-private-translation/api/private-translation-api';
import type { KnowledgePrivateTranslationProps } from '@/fsd/widgets/knowledge-private-translation';
const props: KnowledgePrivateTranslationProps = {
    actorId: '11111111-1111-4111-8111-111111111111',
    noteId: '22222222-2222-4222-8222-222222222222',
    noteVersion: 1,
    block: {
        id: '33333333-3333-4333-8333-333333333333',
        type: 'bilingual-text',
        language: 'en',
        segments: [
            { id: '44444444-4444-4444-8444-444444444444', text: 'Hello.' },
        ],
        translations: [],
    },
    requestWithSession: (callback) => callback('synthetic-token'),
    access: { kind: 'note', locator: 'a'.repeat(32), key: 'b'.repeat(43) },
};
afterEach(() => vi.unstubAllGlobals());
describe('private translation browser transport', () => {
    it('keeps raw share credentials in headers and makes no cacheable source request', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValue(Response.json({ translations: [] }));
        vi.stubGlobal('fetch', fetch);
        await privateTranslationApi(props).list(new AbortController().signal);
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).not.toContain(props.access!.key);
        expect(url).toContain(
            `/knowledge/${props.noteId}/blocks/${props.block.id}/private-translations`,
        );
        expect(options.headers['X-Languon-Share-Key']).toBe(props.access!.key);
        expect(options.cache).toBe('no-store');
    });
    it('preserves structured allowance offers for the shared explicit consent dialog', async () => {
        const detail = {
            code: 'action_confirmation_required',
            message: 'Confirm',
            correlationId: 'test',
            details: {
                quote: {
                    id: props.actorId,
                    maximumCredits: '3.000',
                    approximateOutputTokens: 500,
                    expiresAt: '2026-10-29T20:00:00Z',
                },
            },
        };
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    Response.json({ error: detail }, { status: 409 }),
                ),
        );
        await expect(
            privateTranslationApi(props).request(
                { operationId: props.actorId, targetLanguage: 'fr' },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ status: 409, detail });
    });
    it('refuses injected source text and unsupported target language before sending', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(
            privateTranslationApi(props).request(
                {
                    operationId: props.actorId,
                    targetLanguage: 'xx-invalid',
                } as never,
                new AbortController().signal,
            ),
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
});
