import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserApiError } from '@languon/browser-auth';
import { textsApi, TextsApiError } from '@/fsd/entities/texts';
const uuid = '123e4567-e89b-42d3-a456-426614174000';
const shareId = 'share-locator-1234';
const key = 's'.repeat(43);
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
const failure = {
    error: {
        code: 'version_conflict',
        message: 'Version changed',
        correlationId: 'test',
    },
};

describe('texts API boundary', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
    afterEach(() => vi.unstubAllGlobals());
    it('validates pagination and forwards authenticated no-store request with abort signal', async () => {
        vi.mocked(fetch).mockResolvedValue(
            json({ data: [], nextCursor: null }),
        );
        const signal = new AbortController().signal;
        await expect(
            textsApi.listTexts(
                'token',
                uuid,
                { lifecycle: 'archived', limit: 7 },
                signal,
            ),
        ).resolves.toEqual({ data: [], nextCursor: null });
        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(String(url)).toBe(
            `/api/text-folders/${uuid}/texts?limit=7&lifecycle=archived`,
        );
        expect(init).toMatchObject({
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal,
        });
        expect(new Headers(init?.headers).get('authorization')).toBe(
            'Bearer token',
        );
    });
    it('preserves exact Unicode and caller operation identity on AI admission', async () => {
        vi.mocked(fetch).mockResolvedValue(json(failure, 409));
        const body = {
            folderId: uuid,
            operationId: uuid,
            sourceText: '😀 Привет\n\n世界. ',
            sourceLanguage: 'en' as const,
            targetLanguage: 'ru' as const,
        };
        await expect(
            textsApi.translateText('token', body),
        ).rejects.toMatchObject({ detail: failure.error });
        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(String(url)).toBe('/api/texts/ai/translation');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual(body);
    });
    it('rejects invalid identity, versions and language pairs before HTTP', () => {
        expect(() => textsApi.getText('token', '../unsafe')).toThrow();
        expect(() =>
            textsApi.archiveText('token', uuid, { expectedVersion: 0 }),
        ).toThrow();
        expect(() =>
            textsApi.createText('token', {
                folderId: uuid,
                sourceText: 'Hello',
                sourceLanguage: 'en',
                targetLanguage: 'en',
            }),
        ).toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
    it('uses PUT for explicit saves and DELETE for share revocation without JSON response', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(json(failure, 409))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        await expect(
            textsApi.saveText('token', uuid, {
                kind: 'metadata',
                title: 'Updated',
                expectedVersion: 2,
            }),
        ).rejects.toBeInstanceOf(TextsApiError);
        await expect(
            textsApi.revokeFolderShare('token', uuid, { expectedVersion: 3 }),
        ).resolves.toBeUndefined();
        expect(
            vi
                .mocked(fetch)
                .mock.calls.map(([url, init]) => [url, init?.method]),
        ).toEqual([
            [`/api/texts/${uuid}`, 'PUT'],
            [`/api/text-folders/${uuid}/share`, 'DELETE'],
        ]);
    });
    it('keeps capabilities exclusively in headers for anonymous read and authenticated child copy', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(
                json({ folder: null, texts: [], nextCursor: null }),
            )
            .mockResolvedValueOnce(json({ id: uuid }, 201));
        await textsApi.readSharedFolder(shareId, key);
        await textsApi.copySharedFolderText('token', shareId, key, uuid, {
            folderId: uuid,
            expectedVersion: 1,
            operationId: uuid,
        });
        for (const [url, init] of vi.mocked(fetch).mock.calls) {
            expect(String(url)).not.toContain(key);
            expect(String(init?.body)).not.toContain(key);
            expect(new Headers(init?.headers).get('x-languon-share-key')).toBe(
                key,
            );
        }
        expect(
            new Headers(vi.mocked(fetch).mock.calls[0]![1]?.headers).get(
                'authorization',
            ),
        ).toBeNull();
        expect(vi.mocked(fetch).mock.calls[1]![0]).toBe(
            `/api/shared-text-folders/${shareId}/texts/${uuid}/copy`,
        );
    });
    it('preserves bare vocabulary failure reasons and supports session refresh errors', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(
                json(
                    {
                        error: {
                            code: 'duplicate_confirmation_required',
                            message: 'Confirm duplicate',
                        },
                    },
                    409,
                ),
            )
            .mockResolvedValueOnce(
                json(
                    {
                        error: {
                            code: 'authentication_required',
                            message: 'Sign in',
                        },
                    },
                    401,
                ),
            );
        await expect(
            textsApi.getSelectionJob('token', uuid),
        ).rejects.toMatchObject({
            status: 409,
            detail: { code: 'duplicate_confirmation_required' },
        });
        await expect(textsApi.getAiJob('token', uuid)).rejects.toBeInstanceOf(
            BrowserApiError,
        );
    });
    it('rejects malformed successful envelopes and safely handles network/invalid error responses', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(json({ data: 'unsafe' }))
            .mockResolvedValueOnce(new Response('invalid', { status: 500 }))
            .mockRejectedValueOnce(new TypeError('Network'));
        await expect(textsApi.listFolders('token')).rejects.toMatchObject({
            status: 502,
        });
        await expect(textsApi.listFolders('token')).rejects.toMatchObject({
            status: 500,
            detail: { code: 'service_unavailable' },
        });
        await expect(textsApi.listFolders('token')).rejects.toMatchObject({
            status: 0,
            detail: { correlationId: 'client-network-error' },
        });
    });
    it('reads a shared text with the shared response envelope and validates capability inputs', async () => {
        vi.mocked(fetch).mockResolvedValue(
            json({ folder: null, texts: [], nextCursor: null }),
        );
        await expect(textsApi.readSharedText(shareId, key)).resolves.toEqual({
            folder: null,
            texts: [],
            nextCursor: null,
        });
        expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
            `/api/shared-texts/${shareId}?limit=25&lifecycle=active`,
        );
        expect(() => textsApi.readSharedText('../unsafe', key)).toThrow();
        expect(() => textsApi.readSharedText(shareId, 'short')).toThrow();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('forwards shared selection capability and preserves duplicate confirmation and operation identity', async () => {
        vi.mocked(fetch).mockResolvedValue(json(failure, 409));
        const body = {
            operationId: uuid,
            source: {
                kind: 'shared-text' as const,
                shareId,
                textId: uuid,
                expectedTextVersion: 2,
            },
            selection: {
                side: 'translation' as const,
                pairId: uuid,
                startOffset: 0,
                endOffset: 2,
            },
            target: { kind: 'new' as const, name: 'Words' },
            confirmDuplicate: true,
        };
        await expect(
            textsApi.enqueueSelection('token', body, key),
        ).rejects.toBeInstanceOf(TextsApiError);
        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(url).toBe('/api/dictionaries/text-selections');
        expect(new Headers(init?.headers).get('x-languon-share-key')).toBe(key);
        expect(JSON.parse(String(init?.body))).toEqual(body);
    });
    it.each([200, 409])(
        'preserves cancellation while reading a %i response body',
        async (status) => {
            const aborts = [
                new DOMException('Aborted', 'AbortError'),
                Object.assign(new Error('Aborted'), { name: 'AbortError' }),
            ];
            for (const abort of aborts) {
                const response = json({}, status);
                vi.spyOn(response, 'json').mockRejectedValue(abort);
                vi.mocked(fetch).mockResolvedValue(response);
                await expect(textsApi.getAiJob('token', uuid)).rejects.toBe(
                    abort,
                );
            }
        },
    );
    it('propagates cancellation unchanged', async () => {
        const abort = new DOMException('Aborted', 'AbortError');
        vi.mocked(fetch).mockRejectedValue(abort);
        await expect(textsApi.getAiJob('token', uuid)).rejects.toBe(abort);
    });
});
