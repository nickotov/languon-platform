import type { AdminSentenceLibraryItem } from '@languon/contracts';
import {
    act,
    cleanup,
    render,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    initialSentenceFilters,
    useSentenceLibrary,
} from '../src/pages/users/hooks/use-sentence-library';
import { useSentenceMutation } from '../src/pages/users/hooks/use-sentence-mutation';
import {
    canDeleteSentences,
    sentenceSelection,
} from '../src/pages/users/lib/sentence-selection';
import { SentenceList } from '../src/pages/users/ui/sentence-library-panel/sentence-list';
import { SentenceMutationDialog } from '../src/pages/users/ui/sentence-library-panel/sentence-mutation-dialog';
import { AdminApiError, adminApi } from '../src/shared/api/admin-api';
import { accessTokenStore } from '../src/shared/auth/access-token-store';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';

const logout = vi.fn();
vi.mock('@refinedev/core', () => ({
    useLogout: () => ({ mutate: logout }),
    useTranslate: () => adminI18nProvider.translate,
}));

const userId = '11111111-1111-4111-8111-111111111111';
const dictionaryId = '22222222-2222-4222-8222-222222222222';
const exerciseId = '33333333-3333-4333-8333-333333333333';
const item: AdminSentenceLibraryItem = {
    exerciseId,
    dictionaryId,
    creatorId: userId,
    creatorArchived: false,
    direction: 'target-to-source',
    sourceLanguage: 'ru',
    targetLanguage: 'fr',
    sourceText: 'Сегодня я работаю.',
    createdAt: '2026-10-07T00:00:00.000Z',
    personalArchivedAt: null,
    globalArchivedAt: null,
    contentState: 'current',
    version: 42,
    sharing: 'private',
};

beforeEach(() => {
    accessTokenStore.set('admin-test-access');
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    );
});
afterEach(() => {
    cleanup();
    accessTokenStore.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function json(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('admin sentence management', () => {
    it('discovers dictionaries only after management is enabled', async () => {
        const discover = vi
            .spyOn(adminApi, 'sentenceDictionaries')
            .mockResolvedValue({ items: [], nextCursor: null });
        const { rerender } = renderHook(
            ({ enabled }) => useSentenceLibrary(userId, enabled),
            { initialProps: { enabled: false } },
        );
        expect(discover).not.toHaveBeenCalled();
        rerender({ enabled: true });
        await waitFor(() => expect(discover).toHaveBeenCalledOnce());
    });
    it('validates the API list boundary and keeps user/dictionary scope in the request', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValue(json({ items: [item], nextCursor: null }));
        vi.stubGlobal('fetch', fetch);
        expect(
            await adminApi.sentences(userId, dictionaryId, {
                ...initialSentenceFilters,
                limit: 25,
            }),
        ).toEqual({ items: [item], nextCursor: null });
        expect(String(fetch.mock.calls[0]?.[0])).toContain(
            `/admin/users/${userId}/dictionaries/${dictionaryId}/sentences?`,
        );
        expect(String(fetch.mock.calls[0]?.[0])).toContain(
            'personalArchive=all',
        );
        fetch.mockResolvedValue(
            json({ items: [{ ...item, version: -1 }], nextCursor: null }),
        );
        await expect(
            adminApi.sentences(userId, dictionaryId, {
                ...initialSentenceFilters,
                limit: 25,
            }),
        ).rejects.toThrow();
    });

    it('requires deletion confirmation before sending a request', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(
            adminApi.mutateSentences(userId, dictionaryId, {
                operationId: crypto.randomUUID(),
                operation: 'delete',
                reason: 'Remove malformed example',
                selection: sentenceSelection([item], [exerciseId]),
            }),
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('uses the opaque version and rejects stale local selections and unarchived deletion', () => {
        expect(sentenceSelection([item], [exerciseId])).toEqual({
            type: 'selected',
            items: [{ exerciseId, expectedVersion: 42 }],
        });
        expect(() => sentenceSelection([], [exerciseId])).toThrow();
        expect(canDeleteSentences([item], [exerciseId])).toBe(false);
        expect(
            canDeleteSentences(
                [{ ...item, creatorArchived: true }],
                [exerciseId],
            ),
        ).toBe(true);
    });

    it('retries an uncertain mutation with the same operation ID and unchanged body', async () => {
        const mutate = vi
            .spyOn(adminApi, 'mutateSentences')
            .mockRejectedValueOnce(new Error('Network unavailable'))
            .mockResolvedValueOnce({ operationId: userId, affectedCount: 1 });
        const success = vi.fn();
        const { result } = renderHook(() =>
            useSentenceMutation(userId, dictionaryId, success),
        );
        act(() => result.current.openSelected('archive', [item], [exerciseId]));
        await act(() =>
            result.current.submit('Archive at learner request', false),
        );
        expect(result.current.confirmation).not.toBeNull();
        expect(result.current.error?.message).toBe('Network unavailable');
        await act(() =>
            result.current.submit(
                'Different reason must not change retry body',
                false,
            ),
        );
        expect(mutate.mock.calls[0]?.[2]).toEqual(mutate.mock.calls[1]?.[2]);
        expect(success).toHaveBeenCalledOnce();
        expect(result.current.confirmation).toBeNull();
    });

    it('confirms the server-frozen matching count and query before allmatching mutation', async () => {
        const snapshot = vi
            .spyOn(adminApi, 'snapshotSentences')
            .mockResolvedValue({
                snapshotToken: 'frozen-selection-token',
                matchingCount: 83,
                expiresAt: '2099-10-07T00:00:00.000Z',
            });
        const mutate = vi
            .spyOn(adminApi, 'mutateSentences')
            .mockResolvedValue({ operationId: userId, affectedCount: 83 });
        const { result } = renderHook(() =>
            useSentenceMutation(userId, dictionaryId, vi.fn()),
        );
        const filters = { ...initialSentenceFilters, creatorArchived: true };
        await act(() => result.current.openAll('delete', filters));
        expect(snapshot).toHaveBeenCalledWith(userId, dictionaryId, {
            operation: 'delete',
            query: filters,
        });
        expect(result.current.confirmation?.count).toBe(83);
        await act(() =>
            result.current.submit('Permanently remove archived examples', true),
        );
        expect(mutate.mock.calls[0]?.[2]).toMatchObject({
            operation: 'delete',
            confirmation: 'delete-archived-examples',
            selection: {
                type: 'all-matching',
                snapshotToken: 'frozen-selection-token',
            },
        });
    });

    it('shows hints-independent preview and selection actions without creating practice exposure', async () => {
        const selected = vi.fn();
        const preview = vi.fn();
        render(
            <SentenceList
                items={[item]}
                loading={false}
                onPreview={preview}
                onSelect={selected}
                selected={[]}
            />,
        );
        await userEvent.click(
            screen.getByRole('checkbox', {
                name: `Select example: ${item.sourceText}`,
            }),
        );
        expect(selected).toHaveBeenCalledWith([exerciseId]);
        await userEvent.click(
            screen.getByRole('button', {
                name: `Preview example: ${item.sourceText}`,
            }),
        );
        expect(preview).toHaveBeenCalledWith(exerciseId);
    });

    it('offers sign-in again on recent-auth rejection and preserves the confirmation', async () => {
        vi.spyOn(adminApi, 'mutateSentences').mockRejectedValue(
            new AdminApiError(403, {
                code: 'recent_authentication_required',
                message: 'Recent sign-in required.',
                correlationId: 'test',
            }),
        );
        const { result } = renderHook(() =>
            useSentenceMutation(userId, dictionaryId, vi.fn()),
        );
        act(() => result.current.openSelected('archive', [item], [exerciseId]));
        await act(() =>
            result.current.submit('Archive from support request', false),
        );
        render(
            <SentenceMutationDialog
                mutation={result.current}
                onReload={vi.fn()}
            />,
        );
        await waitFor(() =>
            expect(
                screen.getByText(
                    'Sign in again to authorize this administrative action.',
                ),
            ).toBeInTheDocument(),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Sign in again' }),
        );
        expect(logout).toHaveBeenCalled();
        expect(result.current.confirmation).not.toBeNull();
    });
});
